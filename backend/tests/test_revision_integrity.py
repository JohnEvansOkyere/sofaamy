"""Focused regression coverage for the approved E/Q/R production chain.

The test sets its own throw-away SQLite database before importing the app:

    cd backend
    python -m unittest discover -s tests -p 'test_revision_integrity.py'
"""
import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

TEST_DATABASE_DIR = tempfile.TemporaryDirectory(
    prefix="sofaamy-revision-integrity-")
os.environ["SOFAAMY_DATABASE_URL"] = (
    f"sqlite:///{TEST_DATABASE_DIR.name}/test.db")

from app import lifecycle, main, models, schemas


def tearDownModule():
    # The engine is module-level, so every test class in this file shares one
    # database. It is disposed once, after the last class has finished.
    main.engine.dispose()
    TEST_DATABASE_DIR.cleanup()


class RevisionIntegrityTest(unittest.TestCase):
    def setUp(self):
        self.db = main.SessionLocal()
        client = models.Client(name="Revision Test Client")
        self.db.add(client)
        self.db.flush()
        self.project = models.Project(
            project_number=f"SOF-P-TEST-{self._testMethodName[-8:]}",
            name="Revision integrity test",
            client_id=client.id,
        )
        self.db.add(self.project)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _create_extraction(self, code, quantity):
        result = main.create_extraction(
            self.project.id,
            schemas.ExtractionIn(
                method="manual",
                created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    code=code,
                    material="Test material",
                    quantity=quantity,
                    unit="pcs",
                    unit_price=10,
                )],
            ),
            self.db,
        )
        return result["extractions"][0]["id"]

    def _add_required_drawing_files(self, revision_id, suffix):
        """Attach the two files a custom revision needs, then finalize it —
        drawing approval has no separate manual step anymore, it happens the
        moment the required files exist (see `main._finalize_drawing_revision`,
        run for real by `upload_drawing_file`; inserting rows directly here
        skips the HTTP upload mechanics but must still finalize the same way).
        """
        revision = self.db.get(models.DrawingRevision, revision_id)
        self.db.add_all([
            models.DrawingFile(
                drawing_revision_id=revision_id,
                kind="client_overview",
                filename=f"overview-{suffix}.pdf",
                stored_name=f"test-overview-{suffix}.pdf",
                size_bytes=10,
                checksum_sha256="a" * 64,
            ),
            models.DrawingFile(
                drawing_revision_id=revision_id,
                kind="factory_breakdown",
                filename=f"factory-{suffix}.pdf",
                stored_name=f"test-factory-{suffix}.pdf",
                size_bytes=20,
                checksum_sha256="b" * 64,
            ),
        ])
        self.db.flush()
        main._finalize_drawing_revision(self.db, revision, "Technical Test")
        self.db.commit()
        return main._technical_workflow_payload(self.db, revision.task.project)

    def _approve_preproduction_qc(self):
        return main.record_preproduction_qc(
            self.project.id,
            schemas.PreProductionQcIn(
                result="approved",
                measurements_verified=True,
                materials_verified=True,
                quantities_verified=True,
                drawings_verified=True,
                procurement_verified=True,
                inspector="QA Test",
            ),
            self.db,
        )

    def _set_material_stock(self, code, stock):
        material = self.db.query(models.Material).filter_by(code=code).one_or_none()
        if material is None:
            material = models.Material(
                code=code, name="Test material", category="Hardware",
                unit="pcs", stock=stock)
            self.db.add(material)
        else:
            material.stock = stock
        self.db.commit()
        return material

    def test_existing_configurator_design_can_be_confirmed_without_redraw(self):
        self.db.add(models.DesignRecord(
            project_id=self.project.id,
            ref="TEST-WINDOW-01",
            name="Accepted configurator window",
            client_name="Revision Test Client",
            qty=1,
            design_json='{"category":"frame","width":1200,"height":1500,"cells":[]}',
        ))
        self.db.commit()
        extraction_id = self._create_extraction("TEST-MAT", 2)
        main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=extraction_id,
                product="Accepted configurator window",
                client_total=500,
                deposit_percent=80,
            ),
            self.db,
        )
        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        main.quote_status(
            quote.quote_number,
            schemas.QuoteStatusIn(status="Accepted"),
            self.db,
        )
        self.db.add(models.Payment(
            job_id=quote.job_id, amount=400, kind="deposit", method="bank"))
        self.db.commit()
        self._set_material_stock("TEST-MAT", 10)
        main.release_project_to_technical(
            self.project.id,
            schemas.ReleaseToTechnicalIn(released_by="Accounts Test"),
            self.db,
        )

        workflow = main.approve_existing_configurator_design(
            self.project.id,
            schemas.ExistingDesignApprovalIn(),
            self.db,
        )
        revision = workflow["drawing_tasks"][0]["revisions"][0]
        self.assertEqual(workflow["project"]["workflow_status"], "drawing_approved")
        self.assertEqual(revision["status"], "approved")
        self.assertEqual(revision["files"][0]["kind"], "configurator_snapshot")
        self.assertFalse(any(
            row["project_id"] == self.project.id
            for row in main.list_production_jobs(self.db)))

        main.submit_project_to_qc(
            self.project.id,
            schemas.SubmitToQcIn(submitted_by="Technical Test"),
            self.db,
        )
        gate = self._approve_preproduction_qc()
        self.assertTrue(gate["approved"])
        release = main._technical_workflow_payload(
            self.db, self.project)["production_releases"][0]
        self.assertEqual(release["status"], "current")
        self.assertEqual(release["files"][0]["kind"], "configurator_snapshot")
        production_jobs = [
            row for row in main.list_production_jobs(self.db)
            if row["project_id"] == self.project.id]
        self.assertEqual(len(production_jobs), 1)
        self.assertTrue(production_jobs[0]["production_authorized"])
        self.assertEqual(
            production_jobs[0]["factory_release"]["release_number"],
            release["release_number"])

        stored = self.db.query(models.DrawingFile).filter_by(
            drawing_revision_id=revision["id"]).one()
        (main.DRAWING_STORAGE / stored.stored_name).unlink(missing_ok=True)

    def test_marking_drawing_not_required_still_auto_confirms_and_releases_at_qc_approval(self):
        """QC approval is still the only factory-release gate — no separate
        Technical click to release. But reaching QC now requires Technical
        to explicitly submit the project (see `submit_project_to_qc`), and
        that requires every item to be either drawing-approved or marked
        not-required — no more silent bypass for an item with no drawing
        task at all. Once marked not-required, QC approving still
        auto-confirms the saved configurator design as R1, exactly like the
        "Confirm existing design is final" button used to require a person
        to click first, then releases it in the same action."""
        self.db.add(models.DesignRecord(
            project_id=self.project.id,
            ref="TEST-WINDOW-02",
            name="No-redraw window",
            client_name="Revision Test Client",
            qty=1,
            design_json='{"category":"frame","width":1200,"height":1500,"cells":[]}',
        ))
        self.db.commit()
        extraction_id = self._create_extraction("TEST-MAT", 2)
        main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=extraction_id,
                product="No-redraw window",
                client_total=500,
                deposit_percent=80,
            ),
            self.db,
        )
        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        main.quote_status(
            quote.quote_number,
            schemas.QuoteStatusIn(status="Accepted"),
            self.db,
        )
        self.db.add(models.Payment(
            job_id=quote.job_id, amount=400, kind="deposit", method="bank"))
        self.db.commit()
        self._set_material_stock("TEST-MAT", 10)
        main.release_project_to_technical(
            self.project.id,
            schemas.ReleaseToTechnicalIn(released_by="Accounts Test"),
            self.db,
        )

        # No drawing task exists yet — declare it not required instead of
        # drawing it, then submit to QC. QC's own readiness gate must not
        # separately block on the missing drawing task once submitted,
        # since this item is auto-releasable.
        main.mark_drawing_not_required(
            self.project.id,
            schemas.DrawingNotRequiredIn(
                reason="Standard catalog design — no drawing required",
                created_by="Technical Test"),
            self.db,
        )
        main.submit_project_to_qc(
            self.project.id,
            schemas.SubmitToQcIn(submitted_by="Technical Test"),
            self.db,
        )
        gate = main._preproduction_qc_payload(self.db, self.project)
        self.assertEqual(gate["issues"], [])

        gate = self._approve_preproduction_qc()
        self.assertTrue(gate["approved"])
        workflow = main._technical_workflow_payload(self.db, self.project)
        revision = workflow["drawing_tasks"][0]["revisions"][0]
        self.assertEqual(revision["status"], "approved")
        self.assertEqual(revision["files"][0]["kind"], "configurator_snapshot")
        release = workflow["production_releases"][0]
        self.assertEqual(release["status"], "current")
        production_jobs = [
            row for row in main.list_production_jobs(self.db)
            if row["project_id"] == self.project.id]
        self.assertEqual(len(production_jobs), 1)
        self.assertTrue(production_jobs[0]["production_authorized"])

        stored = self.db.query(models.DrawingFile).filter_by(
            drawing_revision_id=revision["id"]).one()
        (main.DRAWING_STORAGE / stored.stored_name).unlink(missing_ok=True)

    def test_release_to_technical_fills_in_a_missing_extraction_without_rewinding_workflow(self):
        """The quick quote-from-design path (Save & Create Job) never runs
        Technical Workflow's own extraction step, so an item can reach
        payment with no material take-off at all — Technical would open a
        drawing task to an empty Materials tab. Release-to-Technical must
        generate one so there's real data to draw against, but must NOT
        rewind this project's already-later workflow_status back to
        "extraction_ready", since that stepper isn't how the quick path
        tracks progress."""
        self.project.workflow_status = "quote_in_preparation"
        record = models.DesignRecord(
            project_id=self.project.id,
            ref="TEST-QUICK-01",
            name="Quick quote window",
            client_name="Revision Test Client",
            qty=1,
            design_json='{"category":"frame","width":1200,"height":1500,"cells":[]}',
        )
        self.db.add(record); self.db.flush()
        job = models.Job(
            job_number="SOF-TEST-QUICK-01", client_id=self.project.client_id,
            project_id=self.project.id, product="Quick quote window")
        self.db.add(job); self.db.flush()
        self.db.add(models.Payment(
            job_id=job.id, amount=500, kind="deposit", method="bank"))
        self.db.commit()

        self.assertIsNone(
            main._latest_approved_extraction(self.project, record.id))
        main.release_project_to_technical(
            self.project.id,
            schemas.ReleaseToTechnicalIn(released_by="Accounts Test"),
            self.db,
        )

        self.db.refresh(self.project)
        extraction = main._latest_approved_extraction(self.project, record.id)
        self.assertIsNotNone(extraction)
        self.assertEqual(extraction.method, "generated")
        self.assertEqual(self.project.workflow_status, "quote_in_preparation")
        gate = main._preproduction_qc_payload(self.db, self.project)
        item = next(row for row in gate["items"] if row["design_id"] == record.id)
        self.assertEqual(item["extraction_revision"], extraction.revision)

    def test_new_approved_extraction_supersedes_the_whole_downstream_chain(self):
        e1_id = self._create_extraction("TEST-MAT", 7)
        main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=e1_id,
                product="Trialco test opening",
                client_total=500,
                deposit_percent=80,
            ),
            self.db,
        )
        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        main.quote_status(
            quote.quote_number,
            schemas.QuoteStatusIn(status="Accepted"),
            self.db,
        )
        job = self.db.get(models.Job, quote.job_id)
        self.db.add(models.Payment(
            job_id=job.id, amount=500, kind="deposit", method="bank"))
        self.db.commit()
        self._set_material_stock("TEST-MAT", 20)
        main.release_project_to_technical(
            self.project.id,
            schemas.ReleaseToTechnicalIn(released_by="Accounts Test"),
            self.db,
        )

        workflow = main.create_drawing_task(
            self.project.id,
            schemas.DrawingTaskIn(
                extraction_id=e1_id,
                assigned_to="Technical Test",
            ),
            self.db,
        )
        task_id = workflow["drawing_tasks"][0]["id"]
        workflow = main.create_drawing_revision(
            task_id, schemas.DrawingRevisionIn(), self.db)
        revision_id = workflow["drawing_tasks"][0]["revisions"][0]["id"]
        self._add_required_drawing_files(revision_id, "r1")
        main.submit_project_to_qc(
            self.project.id,
            schemas.SubmitToQcIn(submitted_by="Technical Test"),
            self.db,
        )
        gate = self._approve_preproduction_qc()
        self.assertTrue(gate["approved"])
        workflow = main._technical_workflow_payload(self.db, self.project)

        release = workflow["production_releases"][0]
        self.assertEqual(release["status"], "current")
        self.assertEqual(release["extraction_revision"], 1)
        self.assertEqual(release["quotation_number"], quote.quote_number)
        self.assertEqual(len(release["files"]), 2)

        material = self.db.query(models.Material).filter_by(
            code="TEST-MAT").one()
        material.stock = 6
        self.db.commit()
        self.assertIn(
            "only 6 available",
            lifecycle.advance_block_reason(self.db, job),
        )
        material.stock = 20
        self.db.commit()
        issued = lifecycle.issue_materials(self.db, job)
        self.db.flush()
        self.assertEqual(issued, ["7.0 pcs TEST-MAT"])
        movement = self.db.query(models.StockMove).filter_by(
            job_number=job.job_number).one()
        self.assertEqual(movement.extraction_revision, 1)
        self.assertEqual(material.stock, 13)

        with self.assertRaisesRegex(
                HTTPException, "drawing revisions are immutable"):
            asyncio.run(main.upload_drawing_file(
                revision_id, "other", None, "change.pdf", self.db))

        workflow = main.create_drawing_revision(
            task_id,
            schemas.DrawingRevisionIn(notes="Correction after R1 release"),
            self.db,
        )
        r2_id = workflow["drawing_tasks"][0]["revisions"][-1]["id"]
        workflow = self._add_required_drawing_files(r2_id, "r2")
        self.assertEqual(
            workflow["production_releases"][0]["status"], "superseded")
        self.assertIsNone(workflow["project"]["released_at"])
        self.assertIn(
            "Current factory release aligned to extraction E1 required",
            lifecycle.advance_block_reason(self.db, job),
        )
        stale_gate = main.get_preproduction_qc(self.project.id, self.db)
        self.assertEqual(stale_gate["status"], "stale")
        gate = self._approve_preproduction_qc()
        self.assertTrue(gate["approved"])
        workflow = main._technical_workflow_payload(self.db, self.project)
        self.assertEqual(
            workflow["production_releases"][0]["release_number"],
            f"{self.project.project_number}-FP-02",
        )
        self.assertEqual(
            workflow["production_releases"][0]["status"], "current")

        workflow = main.create_extraction(
            self.project.id,
            schemas.ExtractionIn(
                method="manual", created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    code="TEST-MAT", material="Test material",
                    quantity=9, unit="pcs", unit_price=10,
                )],
            ),
            self.db,
        )
        e2_id = workflow["extractions"][0]["id"]

        self.assertEqual(workflow["extractions"][0]["status"], "approved")
        self.assertEqual(workflow["extractions"][1]["status"], "superseded")
        self.assertEqual(
            workflow["drawing_tasks"][0]["status"], "stale_extraction")
        self.assertEqual(
            workflow["production_releases"][0]["status"], "superseded")
        self.assertIsNone(workflow["project"]["released_at"])
        self.assertTrue(workflow["integrity"]["warnings"])
        self.assertEqual(workflow["procurement"]["extraction_revision"], 2)
        self.assertEqual(workflow["procurement"]["rows"][0]["required"], 9)
        self.assertEqual(workflow["procurement"]["rows"][0]["available"], 13)
        self.assertIn(
            "Current factory release aligned to extraction E2 required",
            lifecycle.advance_block_reason(self.db, job),
        )

    def test_quotation_desk_keeps_an_itemised_commercial_snapshot(self):
        extraction_id = self._create_extraction("TEST-MAT", 2)
        extraction = self.db.get(models.TechnicalExtraction, extraction_id)
        item = extraction.items[0]

        workflow = main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=extraction_id,
                product="Quoted test opening",
                lines=[
                    schemas.CommercialQuoteLineIn(
                        extraction_item_id=item.id,
                        # The approved technical values below must win over
                        # attempted commercial edits to scope or quantity.
                        description="Changed material name",
                        quantity=999,
                        unit="wrong",
                        unit_price=25,
                    ),
                    schemas.CommercialQuoteLineIn(
                        description="Installation labour",
                        quantity=1,
                        unit="project",
                        unit_price=100,
                    ),
                ],
                service_charge_percent=10,
                discount_percent=10,
                getf_nhis_percent=5,
                vat_percent=15,
                deposit_percent=70,
                valid_days=7,
            ),
            self.db,
        )

        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        snapshot = main._quote_snapshot(quote)
        self.assertEqual(snapshot["lines"][0]["description"], "Test material")
        self.assertEqual(snapshot["lines"][0]["quantity"], 2)
        self.assertEqual(snapshot["lines"][0]["unit"], "pcs")
        self.assertEqual(snapshot["lines"][0]["unit_price"], 25)
        self.assertEqual(snapshot["priced_lines"], 150)
        self.assertEqual(snapshot["service_charge_percent"], 10)
        self.assertEqual(snapshot["service_charge_amount"], 5)
        self.assertEqual(snapshot["client_subtotal"], 155)
        self.assertEqual(snapshot["grand_total"], 167.4)
        self.assertEqual(quote.total, 167.4)
        report_result = main._result_with_approved_extraction(
            {
                "qty": 1,
                "service_charge_percent": 30,
                "labour_cost_per_unit": 0,
            },
            extraction,
            snapshot,
        )
        self.assertEqual(report_result["material_rows"][0]["unit_price"], 25)
        self.assertEqual(report_result["material_cost"], 50)
        self.assertEqual(report_result["service_charge_percent"], 10)
        self.assertEqual(report_result["service_charge_amount"], 5)
        self.assertEqual(workflow["quotations"][0]["quote_number"],
                         quote.quote_number)

        listed = main.list_quotes(self.db)
        self.assertEqual(listed[0]["commercial"]["valid_days"], 7)
        self.assertNotIn(
            quote.design_id,
            {row["id"] for row in main.list_designs(self.db)})
        response = main.quotation_pdf(quote.quote_number, self.db)
        self.assertTrue(response.body.startswith(b"%PDF"))

    def test_system_inventory_catalog_covers_current_trialco_e2(self):
        current_e2 = [
            ("TF053N / TF073N", 6, "5.8m bar"),
            ("TF065N", 8, "5.8m bar"),
            ("TF223N", 4, "5.8m bar"),
            ("TF224N", 3, "5.8m bar"),
            ("ACC", 3, "set"),
            ("6MBR", 2, "7.2m² sheet"),
            ("ACC04C", 36, "pcs"),
            ("TRIAL-R1", 12, "pcs"),
            ("ACCML", 3, "pcs"),
            ("IT01NC", 12, "pcs"),
            ("ACCNH", 3, "pcs"),
            ("ACCNF", 6.36, "m²"),
            ("ACCGRB", 34.87, "m"),
            ("ACCNRB", 18.72, "m"),
            ("ACCITS", 12, "pcs"),
            ("ACCWPL", 12, "pcs"),
            ("ACCWDC", 6, "pcs"),
            ("ACCPVC", 6, "pcs"),
            ("SIL", 3, "tube"),
            ("ACCITB", 18.72, "m"),
            ("ACCIT SLK", 6, "pcs"),
            ("ACCIT SDH", 6, "pcs"),
            ("ACCIk SDK", 5, "pcs"),
        ]
        lifecycle.ensure_engine_materials(self.db)
        extraction = models.TechnicalExtraction(
            project_id=self.project.id,
            revision=2,
            status="approved",
        )
        self.db.add(extraction)
        self.db.flush()
        for code, quantity, unit in current_e2:
            self.db.add(models.ExtractionItem(
                extraction_id=extraction.id,
                code=code,
                material=code,
                category="Material",
                quantity=quantity,
                unit=unit,
            ))
        self.db.commit()

        self.assertIsNone(
            lifecycle.material_issue_block_reason(self.db, extraction))
        for code, quantity, unit in current_e2:
            material = self.db.query(models.Material).filter_by(code=code).one()
            self.assertEqual(
                lifecycle.normalize_unit(material.unit),
                lifecycle.normalize_unit(unit),
            )
            self.assertGreaterEqual(material.stock, quantity)

    def test_dashboard_exposes_live_department_queues_and_drilldowns(self):
        self.project.workflow_status = "quote_sent"
        quote = models.Quote(
            quote_number=f"TEST-Q-{self.project.id}",
            project_id=self.project.id,
            client_name="Revision Test Client",
            product="Dashboard test opening",
            total=1250,
            status="Sent",
        )
        due_job = models.Job(
            job_number=f"TEST-J-{self.project.id}",
            client_id=self.project.client_id,
            project_id=self.project.id,
            product="Dashboard test opening",
            value=1250,
            deposit_percent=80,
            stage="pending",
        )
        legacy_job = models.Job(
            job_number=f"TEST-LEGACY-{self.project.id}",
            client_id=self.project.client_id,
            product="Existing factory work",
            value=500,
            stage="cutting",
        )
        self.db.add_all([quote, due_job, legacy_job])
        self.db.commit()

        payload = main.dashboard(self.db)
        queues = {row["key"]: row for row in payload["pipeline"]}
        self.assertIn("quotation", queues)
        self.assertIn("accounts", queues)
        self.assertIn("technical", queues)
        self.assertIn("production", queues)
        self.assertTrue(any(
            row["quote_number"] == quote.quote_number
            for row in payload["client_followups"]))
        self.assertTrue(any(
            row["job_number"] == due_job.job_number
            and row["url"] == f"/accounts?job={due_job.job_number}"
            for row in payload["accounts_queue"]))
        self.assertTrue(any(
            row["id"] == self.project.id
            and row["url"] == f"/projects/{self.project.id}"
            and row["action"] == "Open project"
            for row in payload["current_projects"]))
        self.assertIn("receivable_aging", payload["insights"])

        production = main.list_production_jobs(self.db)
        self.assertTrue(any(
            row["job_number"] == legacy_job.job_number
            and row["legacy_active"]
            for row in production))

    def test_site_survey_scheduler_persists_updates_and_drives_workspace(self):
        result = main.create_site_survey(
            self.project.id,
            schemas.SiteSurveyIn(
                scheduled_for="2099-08-17T09:30",
                assigned_to="Abena Sarpong",
                units=12,
                notes="Confirm all opening dimensions",
                who="Kwame Mensah",
            ),
            self.db,
        )
        survey = result["survey"]
        self.assertEqual(survey["status"], "scheduled")
        self.assertEqual(survey["project_id"], self.project.id)
        self.assertEqual(survey["assigned_to"], "Abena Sarpong")

        self.db.refresh(self.project)
        self.assertEqual(self.project.workflow_status, "survey_scheduled")
        workspace = main.get_project_workflow(
            self.project.id, self.db)["workspace"]
        self.assertEqual(workspace["surveys"][0]["id"], survey["id"])
        self.assertEqual(
            workspace["next_action"]["label"], "Complete scheduled site survey")
        self.assertTrue(any(
            "scheduled site survey" in row["note"]
            for row in workspace["timeline"]))

        listed = main.list_site_surveys(self.db)
        self.assertTrue(any(
            row["id"] == survey["id"] for row in listed["surveys"]))
        self.assertGreaterEqual(listed["stats"]["scheduled"], 1)

        updated = main.update_site_survey(
            self.project.id,
            survey["id"],
            schemas.SiteSurveyUpdateIn(
                status="completed", variance="+1.2%", who="Abena Sarpong"),
            self.db,
        )["survey"]
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["variance"], "+1.2%")
        self.assertIsNotNone(updated["completed_at"])
        self.db.refresh(self.project)
        self.assertEqual(self.project.workflow_status, "measurement_received")


class DraftQuoteEditTest(unittest.TestCase):
    """A draft quotation stays editable until it reaches the client."""

    def setUp(self):
        self.db = main.SessionLocal()
        client = models.Client(name="Draft Edit Client")
        self.db.add(client)
        self.db.flush()
        self.project = models.Project(
            project_number=f"SOF-P-EDIT-{self._testMethodName[-8:]}",
            name="Draft quote edit test",
            client_id=client.id,
        )
        self.db.add(self.project)
        self.db.commit()
        self.extraction_id = self._approved_extraction()
        self.quote = self._draft_quote(unit_price=100)

    def tearDown(self):
        self.db.close()

    def _approved_extraction(self):
        result = main.create_extraction(
            self.project.id,
            schemas.ExtractionIn(
                method="manual",
                created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    code="MAT-1", material="Test profile",
                    quantity=4, unit="m", unit_price=0,
                )],
            ),
            self.db,
        )
        return result["extractions"][0]["id"]

    def _payload(self, unit_price):
        item_id = self.db.query(models.ExtractionItem).filter_by(
            extraction_id=self.extraction_id).one().id
        return schemas.ExtractionQuoteIn(
            extraction_id=self.extraction_id,
            product="Test sliding window",
            lines=[schemas.CommercialQuoteLineIn(
                extraction_item_id=item_id,
                description="Test profile",
                quantity=4, unit="m", unit_price=unit_price,
            )],
            service_charge_percent=0,
            discount_percent=0,
            getf_nhis_percent=0,
            vat_percent=0,
            deposit_percent=80,
        )

    def _draft_quote(self, unit_price):
        main.create_quote_from_extraction(
            self.project.id, self._payload(unit_price), self.db)
        return self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()

    def test_draft_edit_keeps_quote_number_and_updates_total(self):
        self.assertEqual(self.quote.status, "Draft")
        self.assertEqual(self.quote.total, 400)
        original_number = self.quote.quote_number

        main.update_quote_from_extraction(
            original_number, self._payload(250), self.db)

        quotes = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).all()
        self.assertEqual(len(quotes), 1, "editing must not mint a new quote")
        self.db.refresh(self.quote)
        self.assertEqual(self.quote.quote_number, original_number)
        self.assertEqual(self.quote.total, 1000)
        snapshot = main._quote_snapshot(self.quote)
        self.assertEqual(snapshot["grand_total"], 1000)
        self.assertEqual(snapshot["lines"][0]["unit_price"], 250)

    def test_sent_quote_cannot_be_edited_in_place(self):
        main.quote_status(
            self.quote.quote_number,
            schemas.QuoteStatusIn(status="Sent"), self.db)

        with self.assertRaises(HTTPException) as raised:
            main.update_quote_from_extraction(
                self.quote.quote_number, self._payload(250), self.db)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("Revise", raised.exception.detail)

        self.db.refresh(self.quote)
        self.assertEqual(self.quote.total, 400, "a sent quote must not change")


class MultiItemProjectTest(unittest.TestCase):
    """A project can hold several distinct items (e.g. a window and a door
    under one Grejoy-style project) — each is its own product needing its own
    material take-off, drawing and factory release; only the commercial quote
    combines them. See MEMORY.md 2026-08-01 "Technical pipeline made per-item
    for multi-item projects" for the full background."""

    def setUp(self):
        self.db = main.SessionLocal()
        client = models.Client(name="Grejoy Test Client")
        self.db.add(client)
        self.db.flush()
        self.project = models.Project(
            project_number=f"SOF-P-MULTI-{self._testMethodName}",
            name="Grejoy multi-item test",
            client_id=client.id,
        )
        self.db.add(self.project)
        self.db.flush()
        self.window = models.DesignRecord(
            project_id=self.project.id,
            ref="WINDOW-01",
            name="Sliding window",
            client_name="Grejoy Test Client",
            qty=5,
            design_json='{"category":"frame","width":1190,"height":1250,"cells":[]}',
        )
        self.door = models.DesignRecord(
            project_id=self.project.id,
            ref="DOOR-01",
            name="Sliding door",
            client_name="Grejoy Test Client",
            qty=1,
            design_json='{"category":"frame","width":2000,"height":2200,"cells":[]}',
        )
        self.db.add_all([self.window, self.door])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _extraction_for(self, design_id, code, quantity):
        """Create an extraction and return its ORM row unambiguously.

        Two items can independently sit at the same revision number (both
        start at 1), so picking "the" row out of the API response's mixed,
        revision-sorted list is ambiguous — query it back by id instead.
        """
        main.create_extraction(
            self.project.id,
            schemas.ExtractionIn(
                design_id=design_id,
                method="manual",
                created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    code=code, material="Test material",
                    quantity=quantity, unit="pcs", unit_price=10,
                )],
            ),
            self.db,
        )
        return (
            self.db.query(models.TechnicalExtraction)
            .filter_by(project_id=self.project.id, design_id=design_id)
            .order_by(models.TechnicalExtraction.id.desc())
            .first()
        )

    def test_extraction_requires_item_selection_once_project_has_two_items(self):
        with self.assertRaisesRegex(HTTPException, "more than one item"):
            main.create_extraction(
                self.project.id,
                schemas.ExtractionIn(
                    method="manual", created_by="Technical Test",
                    items=[schemas.ExtractionItemIn(
                        material="Test material", quantity=1, unit_price=10)],
                ),
                self.db,
            )

    def test_two_items_get_independent_revision_numbering(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        door_e1 = self._extraction_for(self.door.id, "DOOR-MAT", 1)
        self.assertEqual(window_e1.revision, 1)
        self.assertEqual(door_e1.revision, 1)

        window_e2 = self._extraction_for(self.window.id, "WIN-MAT", 7)
        self.assertEqual(window_e2.revision, 2)
        self.db.refresh(door_e1)
        self.assertEqual(
            door_e1.revision, 1,
            "the window's own chain reaching revision 2 must not bump "
            "the door's independent numbering")

    def test_creating_one_items_extraction_never_touches_sibling_item(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        self.assertEqual(
            window_e1.status, "approved",
            "extraction has no separate manual approval step anymore")

        door_e1 = self._extraction_for(self.door.id, "DOOR-MAT", 1)
        self.db.refresh(window_e1)
        self.assertEqual(
            door_e1.status, "approved")
        self.assertEqual(
            window_e1.status, "approved",
            "creating the door's extraction must not supersede the window's")

    def test_workflow_payload_lists_both_items_with_their_own_summary(self):
        self._extraction_for(self.window.id, "WIN-MAT", 6)
        self._extraction_for(self.door.id, "DOOR-MAT", 1)

        workflow = main.get_project_workflow(self.project.id, self.db)
        design_ids = {row["design_id"] for row in workflow["items"]}
        self.assertEqual(design_ids, {self.window.id, self.door.id})

        window_summary = workflow["item_summary"][str(self.window.id)]
        door_summary = workflow["item_summary"][str(self.door.id)]
        self.assertEqual(window_summary["approved_extraction_revision"], 1)
        self.assertEqual(
            door_summary["approved_extraction_revision"], 1,
            "each item gets its own independently approved E1")

    def test_project_workspace_rollup_keeps_item_chains_independent(self):
        self._extraction_for(self.window.id, "WIN-MAT", 6)

        workspace = main.get_project_workflow(
            self.project.id, self.db)["workspace"]
        items = {
            item["design_id"]: item
            for group in workspace["item_groups"]
            for item in group["items"]
        }
        stages = {stage["key"]: stage for stage in workspace["pipeline"]}

        self.assertEqual(
            items[self.window.id]["references"]["extraction"], "E1")
        self.assertIsNone(
            items[self.door.id]["references"]["extraction"])
        # extraction has no separate pipeline stage anymore — it's generated
        # (and approved) automatically; the door item still needs a
        # quotation, so that's the next blocking stage.
        self.assertEqual(workspace["next_action"]["stage"], "quotation")
        self.assertEqual(stages["measurement"]["state"], "complete")
        self.assertEqual(stages["design"]["state"], "complete")
        self.assertEqual(stages["quotation"]["state"], "current")
        self.assertEqual(
            workspace["rollups"]["technical"]["approved_extractions"], 1)
        self.assertTrue(any(
            "DOOR-01" in alert["title"] for alert in workspace["alerts"]))

    def test_project_assignment_tasks_calendar_and_board_are_event_sourced(self):
        with self.assertRaisesRegex(
                HTTPException, "Client acceptance is required"):
            main.update_project_management(
                self.project.id,
                schemas.ProjectManagementIn(
                    planned_start="2026-08-10", due_date="2026-08-20"),
                self.db,
            )
        management = main.update_project_management(
            self.project.id,
            schemas.ProjectManagementIn(
                owner="Ama Technical", team="Technical",
                priority="high", who="Kwame Mensah"),
            self.db,
        )
        self.assertEqual(management["owner"], "Ama Technical")

        management = main.create_project_task(
            self.project.id,
            schemas.ProjectTaskIn(
                department="Procurement", title="Reserve approved profiles",
                assignee="Procurement Team", due_date="2020-01-01",
                who="Kwame Mensah"),
            self.db,
        )
        task = management["tasks"][0]
        self.assertTrue(task["overdue"])
        workspace = main.get_project_workflow(
            self.project.id, self.db)["workspace"]
        self.assertEqual(workspace["header"]["owner"], "Ama Technical")
        self.assertEqual(workspace["management"]["open_task_count"], 1)
        self.assertTrue(any(
            "Overdue Procurement task" == alert["title"]
            for alert in workspace["alerts"]))

        management = main.update_project_task(
            self.project.id, task["id"],
            schemas.ProjectTaskUpdateIn(status="done", who="Ama Technical"),
            self.db,
        )
        self.assertEqual(management["open_task_count"], 0)
        board_card = next(
            card for card in main.project_board(self.db)["cards"]
            if card["id"] == self.project.id)
        self.assertEqual(board_card["owner"], "Ama Technical")
        self.assertEqual(board_card["priority"], "high")

    def test_combined_quote_bundles_both_items_materials(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        door_e1 = self._extraction_for(self.door.id, "DOOR-MAT", 1)

        workflow = main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=window_e1.id,
                extra_extraction_ids=[door_e1.id],
                product="Grejoy window + door",
                client_total=2000,
                deposit_percent=80,
            ),
            self.db,
        )
        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        self.assertEqual(
            main._quote_extraction_ids(quote), [window_e1.id, door_e1.id])
        self.assertEqual(
            workflow["quotations"][0]["extraction_ids"],
            [window_e1.id, door_e1.id])

    def test_project_material_payload_uses_each_items_approved_extraction(self):
        self._extraction_for(self.window.id, "WIN-MAT", 6)
        self._extraction_for(self.door.id, "DOOR-MAT", 2)

        payload = main._project_quote_payload(self.project)
        items = {item["id"]: item for item in payload["items"]}

        window_result = items[self.window.id]["result"]
        door_result = items[self.door.id]["result"]
        self.assertEqual(window_result["approved_extraction_revision"], 1)
        self.assertEqual(door_result["approved_extraction_revision"], 1)
        self.assertEqual(
            [row["code"] for row in window_result["material_rows"]],
            ["WIN-MAT"])
        self.assertEqual(
            [row["code"] for row in door_result["material_rows"]],
            ["DOOR-MAT"])
        self.assertIsNone(
            payload["approved_extraction"],
            "item-scoped projects must not collapse to one legacy extraction")

    def test_project_cutting_pack_labels_each_item_and_preserves_end_angles(self):
        with patch.object(
                main, "project_cutting_list_pdf", return_value=b"%PDF-test") as pdf:
            response = main.project_cutting_list(self.project.id, self.db)

        payload, item_packs, plan = pdf.call_args.args
        self.assertEqual(response.body, b"%PDF-test")
        self.assertEqual(payload["project_number"], self.project.project_number)
        self.assertEqual(
            [pack["label"] for pack in item_packs], ["Window 1", "Door 1"])
        optimized_cuts = [
            cut for group in plan["groups"]
            for bar in group["bars"] for cut in bar["cuts"]
        ]
        self.assertEqual(
            {cut["bundle"] for cut in optimized_cuts}, {"Window 1", "Door 1"})
        self.assertTrue(all(cut["cuts"] == "45°/45°" for cut in optimized_cuts))
        rendered = main.project_cutting_list(self.project.id, self.db)
        self.assertTrue(rendered.body.startswith(b"%PDF"))

    def test_item_report_uses_only_the_selected_items_approved_extraction(self):
        self._extraction_for(self.window.id, "WIN-MAT", 6)
        self._extraction_for(self.door.id, "DOOR-MAT", 2)

        request = schemas.DesignQuoteIn(
            client_name="Grejoy Test Client",
            project_id=self.project.id,
            design_id=self.door.id,
            design=schemas.DesignIn(
                category="frame", name="Ignored request payload",
                width=400, height=400, cells=[]),
        )
        with patch.object(
                main, "price_breakdown_pdf", return_value=b"%PDF-test") as pdf:
            response = main.design_report("price-breakdown", request, self.db)

        result = pdf.call_args.args[1]
        self.assertEqual(response.body, b"%PDF-test")
        self.assertEqual(result["approved_extraction_revision"], 1)
        self.assertEqual(
            [row["code"] for row in result["material_rows"]],
            ["DOOR-MAT"])
        self.assertNotIn(
            "WIN-MAT", [row["code"] for row in result["material_rows"]])

    def test_assign_ungrouped_legacy_chain_to_one_item_only(self):
        # Simulate a project that started before per-item scoping, when it
        # only had one item — its whole chain has design_id=None.
        solo_client = models.Client(name="Legacy Solo Client")
        self.db.add(solo_client); self.db.flush()
        solo_project = models.Project(
            project_number="SOF-P-LEGACY-1", name="Legacy solo project",
            client_id=solo_client.id)
        self.db.add(solo_project); self.db.flush()
        solo_item = models.DesignRecord(
            project_id=solo_project.id, ref="SOLO-01", name="Solo window",
            client_name="Legacy Solo Client", qty=1,
            design_json='{"category":"frame","width":1000,"height":1000,"cells":[]}')
        self.db.add(solo_item); self.db.commit()

        result = main.create_extraction(
            solo_project.id,
            schemas.ExtractionIn(
                method="manual", created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    code="LEGACY-MAT", material="Test material",
                    quantity=3, unit_price=10)],
            ),
            self.db,
        )
        legacy = result["extractions"][0]
        self.assertIsNone(legacy["design_id"])

        # A second item now gets added to what used to be a single-item
        # project — this is exactly the Grejoy scenario.
        second_item = models.DesignRecord(
            project_id=solo_project.id, ref="SOLO-02", name="Solo door",
            client_name="Legacy Solo Client", qty=1,
            design_json='{"category":"frame","width":900,"height":2100,"cells":[]}')
        self.db.add(second_item); self.db.commit()

        main.assign_ungrouped_extractions_to_item(
            solo_project.id,
            schemas.AssignExtractionsToItemIn(design_id=solo_item.id),
            self.db,
        )
        extraction = self.db.get(models.TechnicalExtraction, legacy["id"])
        self.assertEqual(extraction.design_id, solo_item.id)

        with self.assertRaisesRegex(HTTPException, "no ungrouped extraction"):
            main.assign_ungrouped_extractions_to_item(
                solo_project.id,
                schemas.AssignExtractionsToItemIn(design_id=second_item.id),
                self.db,
            )

    def test_drawing_task_basis_status_is_scoped_to_its_own_item(self):
        # Regression: basis_status must compare a task against its OWN
        # item's current chain, not the single project-wide "approved
        # extraction" — otherwise every real item's drawing task would show
        # as permanently "stale" once items have their own chains.
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        workflow = main.create_quote_from_extraction(
            self.project.id,
            schemas.ExtractionQuoteIn(
                extraction_id=window_e1.id,
                product="Grejoy window",
                client_total=500,
                deposit_percent=80,
            ),
            self.db,
        )
        quote = self.db.query(models.Quote).filter_by(
            project_id=self.project.id).one()
        main.quote_status(
            quote.quote_number, schemas.QuoteStatusIn(status="Accepted"), self.db)
        self.db.add(models.Payment(
            job_id=quote.job_id, amount=5000, kind="deposit", method="bank"))
        self.db.commit()
        main.release_project_to_technical(
            self.project.id,
            schemas.ReleaseToTechnicalIn(released_by="Accounts Test"),
            self.db,
        )

        workflow = main.create_drawing_task(
            self.project.id,
            schemas.DrawingTaskIn(
                design_id=self.window.id, extraction_id=window_e1.id,
                assigned_to="Technical Test"),
            self.db,
        )
        task = next(
            row for row in workflow["drawing_tasks"]
            if row["design_id"] == self.window.id)
        self.assertEqual(task["basis_status"], "current")

    def test_cannot_assign_ungrouped_chain_to_an_item_that_already_has_one(self):
        solo_client = models.Client(name="Legacy Solo Client 2")
        self.db.add(solo_client); self.db.flush()
        solo_project = models.Project(
            project_number="SOF-P-LEGACY-2", name="Legacy solo project 2",
            client_id=solo_client.id)
        self.db.add(solo_project); self.db.flush()
        first_item = models.DesignRecord(
            project_id=solo_project.id, ref="A-01", name="Item A",
            client_name="Legacy Solo Client 2", qty=1,
            design_json='{"category":"frame","width":1000,"height":1000,"cells":[]}')
        self.db.add(first_item); self.db.commit()
        main.create_extraction(
            solo_project.id,
            schemas.ExtractionIn(
                method="manual", created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    material="Test material", quantity=3, unit_price=10)],
            ),
            self.db,
        )
        second_item = models.DesignRecord(
            project_id=solo_project.id, ref="B-01", name="Item B",
            client_name="Legacy Solo Client 2", qty=1,
            design_json='{"category":"frame","width":900,"height":2100,"cells":[]}')
        self.db.add(second_item); self.db.commit()
        main.create_extraction(
            solo_project.id,
            schemas.ExtractionIn(
                design_id=second_item.id,
                method="manual", created_by="Technical Test",
                items=[schemas.ExtractionItemIn(
                    material="Test material", quantity=2, unit_price=10)],
            ),
            self.db,
        )

        with self.assertRaisesRegex(HTTPException, "already has its own"):
            main.assign_ungrouped_extractions_to_item(
                solo_project.id,
                schemas.AssignExtractionsToItemIn(design_id=second_item.id),
                self.db,
            )


class LeadPipelineTest(unittest.TestCase):
    """The lead record feeds both the register and the dashboard breakdowns."""

    def setUp(self):
        self.db = main.SessionLocal()
        # every class in this file shares one database, and these tests assert
        # on whole-table aggregates, so each one starts from an empty register
        for lead in self.db.scalars(main.select(models.Lead)).all():
            self.db.delete(lead)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _create(self, name, **fields):
        return main.create_lead(schemas.LeadIn(name=name, **fields), self.db)

    def test_stage_drives_the_dashboard_summary_and_breakdowns(self):
        self._create(
            "Cantonments villa", city="Accra", source="Referral",
            product_type="Sliding windows", estimated_value=40000.0,
            stage="quoted")
        self._create(
            "Takoradi office", city="Takoradi", source="Website",
            product_type="Curtain wall", estimated_value=100000.0,
            stage="enquiry")

        summary = main.list_leads(self.db)["summary"]
        # an enquiry that was never quoted must not inflate the quoted figure
        self.assertEqual(summary["quoted"]["count"], 1)
        self.assertEqual(summary["quoted"]["value"], 40000.0)
        self.assertEqual(summary["created"]["value"], 140000.0)

        cities = {row["label"]: row["value"]
                  for row in main.list_leads(self.db)["by_city"]}
        self.assertEqual(cities["Accra"], 40000.0)
        self.assertEqual(cities["Takoradi"], 100000.0)

    def test_lead_value_switches_to_the_real_quote_total_once_one_exists(self):
        """A stale manually-typed estimate (or the 0.0 default — there is no
        UI to type one) must not keep showing once the lead has a real
        project and a saved design/quote — that quote's actual total is
        what staff need to compare against what Accounts later collects."""
        lead = self._create(
            "East Legon windows", contact_name="Kofi Mensah",
            product_type="Sliding windows", estimated_value=15000.0)
        self.assertEqual(
            main.list_leads(self.db)["leads"][0]["estimated_value"], 15000.0)

        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=2,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id, design=design),
            self.db)
        real_total = self.db.scalar(main.select(models.DesignRecord.total).where(
            models.DesignRecord.project_id == project_id))
        self.assertGreater(real_total, 0)

        refreshed = next(
            row for row in main.list_leads(self.db)["leads"]
            if row["id"] == lead["id"])
        self.assertEqual(refreshed["estimated_value"], round(real_total, 2))
        self.assertNotEqual(refreshed["estimated_value"], 15000.0)

        workspace_row = next(
            row for row in main.list_quote_workspaces(self.db)
            if row["project_id"] == project_id)
        self.assertEqual(workspace_row["value"], workspace_row["quote_value"])
        self.assertEqual(workspace_row["value"], round(real_total, 2))

    def test_losing_a_lead_records_its_reason_and_clearing_it_on_reopen(self):
        lead = self._create("Adenta shopfront", estimated_value=25000.0)
        main.update_lead(
            lead["id"], schemas.LeadUpdate(stage="lost", lost_reason="Price too high"),
            self.db)
        reasons = {row["label"] for row in main.list_leads(self.db)["lost_reasons"]}
        self.assertIn("Price too high", reasons)

        # reopening must not leave a stale loss reason behind on the record
        reopened = main.update_lead(
            lead["id"], schemas.LeadUpdate(stage="quoted"), self.db)
        self.assertEqual(reopened["lost_reason"], "")
        self.assertIsNone(reopened["closed_at"])
        self.assertIsNotNone(reopened["quoted_at"])

    def test_conversion_creates_one_project_and_refuses_a_second(self):
        lead = self._create(
            "Labone residence", contact_name="Akosua Mensah",
            site="Labone", product_type="Frameless", estimated_value=90000.0)
        result = main.convert_lead(
            lead["id"],
            schemas.ProjectIn(
                name="Labone residence", client_name="Akosua Mensah",
                location="Labone", product_family="frameless"),
            self.db)

        self.assertEqual(result["lead"]["stage"], "won")
        self.assertEqual(result["lead"]["project_id"], result["project"]["id"])
        project = self.db.get(models.Project, result["project"]["id"])
        self.assertEqual(project.product_family, "frameless")

        with self.assertRaisesRegex(HTTPException, "already has a project"):
            main.convert_lead(
                lead["id"], schemas.ProjectIn(name="Labone residence"), self.db)

    def test_a_payment_marks_a_still_open_lead_won_but_never_reopens_a_lost_one(self):
        """Real historical data has leads whose `project_id` was linked
        without ever running through `convert_lead` (e.g. backfilled for a
        project that already existed) — those must still flip to "won" the
        moment real money is recorded against them, matching Evans's own
        framing: any payment from a client is a deal won."""
        lead = self._create("Dzorwulu residence", contact_name="Abena Owusu")
        client = models.Client(name="Abena Owusu")
        self.db.add(client); self.db.flush()
        project = models.Project(
            project_number="SOF-P-TEST-WONPAY", name="Dzorwulu residence",
            client_id=client.id)
        self.db.add(project); self.db.flush()
        job = models.Job(
            job_number="SOF-TEST-WONPAY-01", client_id=client.id,
            project_id=project.id, product="Window", value=1000)
        self.db.add(job); self.db.commit()
        db_lead = self.db.get(models.Lead, lead["id"])
        db_lead.project_id = project.id
        self.db.commit()

        main.add_payment(
            job.job_number,
            schemas.PaymentIn(amount=500, kind="deposit", method="bank"),
            self.db)
        reloaded = self.db.get(models.Lead, lead["id"])
        self.assertEqual(reloaded.stage, "won")
        self.assertIsNotNone(reloaded.closed_at)

        # a deal already marked lost after the fact must not be silently
        # reopened by a later payment against the same project
        main.update_lead(
            lead["id"], schemas.LeadUpdate(stage="lost", lost_reason="Client cancelled"),
            self.db)
        main.add_payment(
            job.job_number,
            schemas.PaymentIn(amount=100, kind="balance", method="bank"),
            self.db)
        still_lost = self.db.get(models.Lead, lead["id"])
        self.assertEqual(still_lost.stage, "lost")

    def test_converting_an_assigned_lead_carries_the_assignee_onto_the_project(self):
        lead = self._create(
            "Cantonments villa", contact_name="Kofi Mensah",
            site="Cantonments", sales_executive="Kofi Adjei")
        result = main.convert_lead(
            lead["id"],
            schemas.ProjectIn(name="Cantonments villa", client_name="Kofi Mensah"),
            self.db)
        project = self.db.get(models.Project, result["project"]["id"])
        management = main._project_management_payload(project)
        self.assertEqual(management["owner"], "Kofi Adjei")

    def test_converting_an_unassigned_lead_leaves_the_project_without_an_owner(self):
        lead = self._create("Osu shopfront", contact_name="Ama Boateng", site="Osu")
        result = main.convert_lead(
            lead["id"],
            schemas.ProjectIn(name="Osu shopfront", client_name="Ama Boateng"),
            self.db)
        project = self.db.get(models.Project, result["project"]["id"])
        management = main._project_management_payload(project)
        self.assertEqual(management["owner"], "")

    def test_quote_workspace_carries_opportunity_but_not_project_dates(self):
        lead = self._create(
            "Airport residence", contact_name="Ama Owusu", phone="0240000000",
            site="Airport Residential Area", city="Accra",
            product_type="Sliding windows", estimated_value=56000.0)

        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)

        self.assertEqual(workspace["opportunity_id"], lead["id"])
        self.assertEqual(workspace["scope"], "active")
        self.assertEqual(workspace["planned_start"], "")
        self.assertEqual(workspace["due_date"], "")
        saved_lead = self.db.get(models.Lead, lead["id"])
        project = self.db.get(models.Project, workspace["project_id"])
        self.assertEqual(saved_lead.stage, "quoted")
        self.assertEqual(saved_lead.project_id, project.id)
        self.assertEqual(project.extraction_method, "generated")
        self.assertEqual(project.client.phone, "0240000000")

        with self.assertRaisesRegex(HTTPException, "already has a quote workspace"):
            main.create_quote_workspace(
                schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)

    def test_saving_measurements_creates_and_updates_one_automatic_draft(self):
        lead = self._create(
            "East Legon windows", contact_name="Kofi Mensah",
            product_type="Sliding windows", estimated_value=42000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=2,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )

        first = main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id, design=design),
            self.db)
        first_total = self.db.scalar(main.select(models.Quote.total).where(
            models.Quote.quote_number == first["quote_number"]))
        self.assertEqual(first["quote_status"], "Draft")
        self.assertGreater(first_total, 0)

        updated = main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id,
            design=design.model_copy(update={"width": 1600})), self.db)
        drafts = self.db.scalars(main.select(models.Quote).where(
            models.Quote.project_id == project_id,
            models.Quote.status == "Draft")).all()
        self.assertEqual(len(drafts), 1)
        self.assertEqual(updated["quote_number"], first["quote_number"])
        self.assertNotEqual(drafts[0].total, first_total)

        row = next(item for item in main.list_quote_workspaces(self.db)
                   if item["project_id"] == project_id)
        self.assertEqual(row["default_quote"], first["quote_number"])
        self.assertEqual(row["quantity"], 2)
        self.assertGreater(row["area"], 0)

    def test_manual_selling_price_overrides_and_survives_a_terms_resave(self):
        lead = self._create(
            "Manual pricing test", contact_name="Kofi Mensah",
            product_type="Sliding windows", estimated_value=42000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=2,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )

        first = main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id, design=design),
            self.db)
        auto_total = self.db.scalar(main.select(models.Quote.total).where(
            models.Quote.quote_number == first["quote_number"]))
        quote = self.db.scalar(main.select(models.Quote).where(
            models.Quote.quote_number == first["quote_number"]))
        self.assertEqual(quote.pricing_mode, "auto")
        project_for_totals = self.db.get(models.Project, project_id)
        contract_value_before = main._project_contract_value(project_for_totals)

        manual_price = round(auto_total * 1.5, 2)
        main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id,
            design=design.model_copy(update={
                "pricingMode": "manual", "manualSellingPrice": manual_price,
            })), self.db)
        self.db.refresh(quote)
        self.assertEqual(quote.pricing_mode, "manual")
        self.assertEqual(quote.total, manual_price)

        # the manual price must flow through to the actual figures the rest
        # of the app bills against and displays — not just Quote.total
        project = self.db.get(models.Project, project_id)
        self.db.refresh(project)
        record = self.db.get(models.DesignRecord, quote.design_id)
        self.assertEqual(record.total, manual_price)
        summary = main._project_quote_payload(project)
        self.assertEqual(summary["items"][0]["total"], manual_price)
        # the project-wide contract value must move by exactly the item's
        # price change — everything else (the separately-billed project
        # labour line, tax/discount on it) stays identical since nothing
        # about area/qty/rates changed, only this item's own price
        self.assertEqual(
            main._project_contract_value(project) - contract_value_before,
            round(manual_price - auto_total, 2))

        # editing a Terms field while still in manual mode must not clobber
        # the manual price back to the computed total
        main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id,
            design=design.model_copy(update={
                "pricingMode": "manual", "manualSellingPrice": manual_price,
                "discountPercent": 10,
            })), self.db)
        self.db.refresh(quote)
        self.assertEqual(quote.total, manual_price)
        self.assertEqual(quote.pricing_mode, "manual")

        # switching back to auto resumes tracking the computed total
        main.save_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah", project_id=project_id,
            design=design.model_copy(update={"pricingMode": "auto"})),
            self.db)
        self.db.refresh(quote)
        self.assertEqual(quote.pricing_mode, "auto")
        self.assertNotEqual(quote.total, manual_price)

    def test_material_price_override_updates_cost_heads_but_not_the_rate_card_bill(self):
        """Non-Trialco Frame systems price the client from a fixed GHS/m² rate
        card, independent of material cost — confirmed with Evans that a
        Material List edit here should stay internal-only (Cost Heads
        visibility), not silently change what the client is billed."""
        design = schemas.DesignIn(
            name="Standard casement window", ref="W01", width=1200, height=1500,
            cols=1, rows=1,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        auto = main.price_design(
            schemas.DesignQuoteIn(client_name="Kofi Mensah", design=design), self.db)
        profile_row = next(r for r in auto["material_rows"] if r["category"] == "Profile")
        self.assertNotEqual(profile_row["price_source"], "manual")

        overridden_price = round(profile_row["unit_price"] * 2, 2)
        manual = main.price_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah",
            design=design.model_copy(update={
                "materialPriceOverrides": {profile_row["code"]: overridden_price},
            })), self.db)
        manual_row = next(r for r in manual["material_rows"] if r["code"] == profile_row["code"])
        self.assertEqual(manual_row["price_source"], "manual")
        self.assertEqual(manual_row["unit_price"], overridden_price)
        self.assertEqual(manual_row["total"], round(manual_row["quantity"] * overridden_price, 2))
        # every other row is untouched
        for row in manual["material_rows"]:
            if row["code"] != profile_row["code"]:
                self.assertIn(row, auto["material_rows"])

        # Cost Heads (internal) move with the override...
        self.assertGreater(manual["subtotal"], auto["subtotal"])
        self.assertGreater(manual["margin"], auto["margin"])
        self.assertGreater(manual["internal_total"], auto["internal_total"])
        # ...but the client-facing rate-card bill does not
        self.assertEqual(manual["grand_total"], auto["grand_total"])

        # omitting materialPriceOverrides behaves exactly as before
        unchanged = main.price_design(
            schemas.DesignQuoteIn(client_name="Kofi Mensah", design=design), self.db)
        self.assertEqual(unchanged, auto)

    def test_trialco_material_override_moves_the_client_bill(self):
        """Trialco's own costing sheet already supports per-row overrides via
        accessoryOverrides (pre-existing mechanism); since Trialco's client
        price is cost-plus, an overridden material price should flow through
        to grand_total — confirmed with Evans this is the one system where
        Material List edits should move the bill."""
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", system="trialco",
            width=1200, height=1500, cols=1, rows=1,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        auto = main.price_design(
            schemas.DesignQuoteIn(client_name="Kofi Mensah", design=design), self.db)
        frame_row = next(r for r in auto["material_rows"] if r["id"] == "trialco-frame")
        self.assertNotEqual(frame_row.get("source"), "Project material override")

        overridden_price = round(frame_row["unit_price"] * 2, 2)
        manual = main.price_design(schemas.DesignQuoteIn(
            client_name="Kofi Mensah",
            design=design.model_copy(update={
                "accessoryOverrides": [{
                    "code": frame_row["code"], "qty": frame_row["quantity"],
                    "unit_price": overridden_price,
                }],
            })), self.db)
        manual_row = next(r for r in manual["material_rows"] if r["id"] == "trialco-frame")
        self.assertEqual(manual_row["source"], "Project material override")
        self.assertEqual(manual_row["unit_price"], overridden_price)
        self.assertGreater(manual["grand_total"], auto["grand_total"])

    def test_payment_can_exceed_the_outstanding_balance(self):
        """Accounts decides whether an amount is correct to record, not the
        system — no cap against the outstanding balance (see the removed
        'Payment exceeds the outstanding balance' rejection in add_payment)."""
        lead = self._create(
            "Overpayment test", contact_name="Ama Boateng",
            product_type="Sliding windows", estimated_value=5000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project = self.db.get(models.Project, workspace["project_id"])
        job = models.Job(
            job_number=f"TEST-PAY-{project.id}", client_id=project.client_id,
            project_id=project.id, product="Overpayment test job",
            value=1000, deposit_percent=80, stage="pending")
        self.db.add(job)
        self.db.commit()

        main.add_payment(job.job_number, schemas.PaymentIn(amount=1500), self.db)
        payments = self.db.query(models.Payment).filter(models.Payment.job_id == job.id).all()
        self.assertEqual(sum(payment.amount for payment in payments), 1500)

    def test_project_quote_decision_updates_every_current_item_and_lead(self):
        lead = self._create(
            "Two product quotation", contact_name="Nana Osei",
            product_type="Sliding windows", estimated_value=88000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        base = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=2,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        main.save_design(schemas.DesignQuoteIn(
            client_name="Nana Osei", project_id=project_id, design=base), self.db)
        main.save_design(schemas.DesignQuoteIn(
            client_name="Nana Osei", project_id=project_id,
            design=base.model_copy(update={
                "name": "Trialco sliding door", "ref": "D01", "qty": 1,
            })), self.db)

        sent = main.update_quote_workspace_status(
            project_id,
            schemas.QuoteWorkspaceStatusIn(status="Sent", who="Sales Test"),
            self.db)
        self.assertEqual(sent["status"], "Sent")
        self.assertEqual(len(sent["quote_numbers"]), 2)
        statuses = self.db.scalars(main.select(models.Quote.status).where(
            models.Quote.project_id == project_id)).all()
        self.assertEqual(statuses, ["Sent", "Sent"])

        accepted = main.update_quote_workspace_status(
            project_id,
            schemas.QuoteWorkspaceStatusIn(status="Accepted", who="Sales Test"),
            self.db)
        self.assertEqual(len(accepted["job_numbers"]), 2)
        saved_lead = self.db.get(models.Lead, lead["id"])
        designs = self.db.scalars(main.select(models.DesignRecord).where(
            models.DesignRecord.project_id == project_id)).all()
        self.assertEqual(saved_lead.stage, "won")
        self.assertTrue(all(design.job_id for design in designs))
        with self.assertRaisesRegex(
                HTTPException, "Required payment must be cleared"):
            main.update_project_management(
                project_id,
                schemas.ProjectManagementIn(
                    planned_start="2026-09-01", due_date="2026-09-30"),
                self.db,
            )
        main.add_payment(
            accepted["job_numbers"][0],
            schemas.PaymentIn(amount=1_000_000, kind="deposit", method="bank"),
            self.db,
        )
        management = main.update_project_management(
            project_id,
            schemas.ProjectManagementIn(
                planned_start="2026-09-01", due_date="2026-09-30"),
            self.db,
        )
        self.assertEqual(management["planned_start"], "2026-09-01")
        self.assertEqual(management["due_date"], "2026-09-30")
        row = next(item for item in main.list_quote_workspaces(self.db)
                   if item["project_id"] == project_id)
        self.assertEqual(row["scope"], "won")
        self.assertEqual(row["planned_start"], "2026-09-01")

    def test_public_share_link_shows_pending_quote_and_rejects_bad_token(self):
        lead = self._create(
            "Public share link test", contact_name="Kojo Mensah",
            product_type="Sliding windows", estimated_value=30000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=1,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        main.save_design(schemas.DesignQuoteIn(
            client_name="Kojo Mensah", project_id=project_id, design=design),
            self.db)

        token = main.project_share_token(project_id)
        view = main.get_shared_project_quote(token, self.db)
        self.assertEqual(view["status"], "pending")
        self.assertEqual(len(view["items"]), 1)
        self.assertGreater(view["grand_total"], 0)
        # no internal cost data leaks onto the public payload
        self.assertNotIn("internal_floor", view)

        with self.assertRaisesRegex(HTTPException, "Invalid share link"):
            main.get_shared_project_quote(f"{project_id}-deadbeef00", self.db)
        with self.assertRaisesRegex(HTTPException, "Invalid share link"):
            main.get_shared_project_quote("99999-deadbeef00", self.db)

    def test_public_share_link_client_accept_opens_a_job_and_tags_the_audit_trail(self):
        lead = self._create(
            "Public share link accept test", contact_name="Ama Boateng",
            product_type="Sliding windows", estimated_value=30000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=1,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        main.save_design(schemas.DesignQuoteIn(
            client_name="Ama Boateng", project_id=project_id, design=design),
            self.db)

        token = main.project_share_token(project_id)
        result = main.accept_shared_project_quote(
            token, schemas.PublicQuoteAcceptIn(confirmed_by="Ama Boateng"), self.db)
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(len(result["job_numbers"]), 1)

        project = self.db.get(models.Project, project_id)
        self.assertEqual(project.status, "accepted")
        saved_lead = self.db.get(models.Lead, lead["id"])
        self.assertEqual(saved_lead.stage, "won")
        event = self.db.scalars(main.select(models.WorkflowEvent).where(
            models.WorkflowEvent.project_id == project_id,
            models.WorkflowEvent.kind == "quote",
        ).order_by(models.WorkflowEvent.created_at.desc())).first()
        # the public endpoint's actor is never confused with a staff name
        self.assertIn("Client (self-service): Ama Boateng", event.who)

        # re-viewing the link now reflects the decision, and accepting again
        # is a safe no-op rather than opening a second job
        view = main.get_shared_project_quote(token, self.db)
        self.assertEqual(view["status"], "accepted")
        again = main.accept_shared_project_quote(
            token, schemas.PublicQuoteAcceptIn(), self.db)
        self.assertEqual(again["job_numbers"], result["job_numbers"])

    def test_public_share_link_accept_blocked_until_every_item_is_quoted(self):
        lead = self._create(
            "Incomplete quote share link test", contact_name="Yaw Owusu",
            product_type="Sliding windows", estimated_value=60000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        # a project with zero saved items has nothing for the client to
        # approve yet — the public endpoint must refuse, not silently accept
        token = main.project_share_token(project_id)
        with self.assertRaisesRegex(
                HTTPException, "Save measurements for every design"):
            main.accept_shared_project_quote(
                token, schemas.PublicQuoteAcceptIn(), self.db)

    def test_decline_requires_a_reason_and_saving_a_revision_reopens_quote(self):
        lead = self._create(
            "Quote loss and revision", contact_name="Abena Boateng",
            product_type="Sliding windows", estimated_value=36000.0)
        workspace = main.create_quote_workspace(
            schemas.QuoteWorkspaceIn(lead_id=lead["id"]), self.db)
        project_id = workspace["project_id"]
        design = schemas.DesignIn(
            name="Trialco sliding window", ref="W01", width=1200, height=1500,
            cols=1, rows=1, qty=1,
            cells=[schemas.DesignCell(opening="sliding", glass="clear")],
        )
        main.save_design(schemas.DesignQuoteIn(
            client_name="Abena Boateng", project_id=project_id, design=design),
            self.db)

        with self.assertRaisesRegex(HTTPException, "lost reason is required"):
            main.update_quote_workspace_status(
                project_id, schemas.QuoteWorkspaceStatusIn(status="Declined"),
                self.db)
        main.update_quote_workspace_status(
            project_id,
            schemas.QuoteWorkspaceStatusIn(
                status="Declined", lost_reason="Client selected another supplier"),
            self.db)
        saved_lead = self.db.get(models.Lead, lead["id"])
        self.assertEqual(saved_lead.stage, "lost")
        self.assertEqual(saved_lead.lost_reason, "Client selected another supplier")

        revised = main.save_design(schemas.DesignQuoteIn(
            client_name="Abena Boateng", project_id=project_id,
            design=design.model_copy(update={"width": 1400})), self.db)
        self.assertEqual(revised["quote_status"], "Draft")
        self.assertEqual(self.db.get(models.Lead, lead["id"]).stage, "quoted")
        self.assertEqual(self.db.get(models.Lead, lead["id"]).lost_reason, "")
        current = main._current_quote_workspace_quotes(
            self.db.get(models.Project, project_id))
        self.assertEqual([quote.status for quote in current], ["Draft"])

    def test_an_unknown_stage_is_refused(self):
        with self.assertRaisesRegex(HTTPException, "Stage must be one of"):
            self._create("Bad stage lead", stage="negotiating")


if __name__ == "__main__":
    unittest.main()
