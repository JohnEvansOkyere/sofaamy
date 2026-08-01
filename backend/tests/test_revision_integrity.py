"""Focused regression coverage for the approved E/Q/R production chain.

The test sets its own throw-away SQLite database before importing the app:

    cd backend
    python -m unittest discover -s tests -p 'test_revision_integrity.py'
"""
import asyncio
import os
import tempfile
import unittest

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
        self.db.commit()

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
        main.approve_extraction(
            extraction_id, schemas.ExtractionApprovalIn(), self.db)
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

        release = main.release_project_to_factory(
            self.project.id,
            schemas.ProductionReleaseIn(drawing_revision_id=revision["id"]),
            self.db,
        )["production_releases"][0]
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

    def test_new_approved_extraction_supersedes_the_whole_downstream_chain(self):
        e1_id = self._create_extraction("TEST-MAT", 7)
        main.approve_extraction(
            e1_id, schemas.ExtractionApprovalIn(), self.db)
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
        main.approve_drawing_revision(
            revision_id, schemas.DrawingApprovalIn(), self.db)
        workflow = main.release_project_to_factory(
            self.project.id,
            schemas.ProductionReleaseIn(
                drawing_revision_id=revision_id),
            self.db,
        )

        release = workflow["production_releases"][0]
        self.assertEqual(release["status"], "current")
        self.assertEqual(release["extraction_revision"], 1)
        self.assertEqual(release["quotation_number"], quote.quote_number)
        self.assertEqual(len(release["files"]), 2)

        material = models.Material(
            code="TEST-MAT",
            name="Test material",
            category="Hardware",
            unit="pcs",
            stock=6,
        )
        self.db.add(material)
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
        self._add_required_drawing_files(r2_id, "r2")
        workflow = main.approve_drawing_revision(
            r2_id, schemas.DrawingApprovalIn(), self.db)
        self.assertEqual(
            workflow["production_releases"][0]["status"], "superseded")
        self.assertIsNone(workflow["project"]["released_at"])
        self.assertIn(
            "Current factory release aligned to extraction E1 required",
            lifecycle.advance_block_reason(self.db, job),
        )
        workflow = main.release_project_to_factory(
            self.project.id,
            schemas.ProductionReleaseIn(drawing_revision_id=r2_id),
            self.db,
        )
        self.assertEqual(
            workflow["production_releases"][0]["release_number"],
            f"{self.project.project_number}-FP-02",
        )
        self.assertEqual(
            workflow["production_releases"][0]["status"], "current")

        e2_id = self._create_extraction("TEST-MAT", 9)
        workflow = main.approve_extraction(
            e2_id, schemas.ExtractionApprovalIn(), self.db)

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

        with self.assertRaisesRegex(HTTPException, "latest extraction E2"):
            main.approve_extraction(
                e1_id, schemas.ExtractionApprovalIn(), self.db)

    def test_quotation_desk_keeps_an_itemised_commercial_snapshot(self):
        extraction_id = self._create_extraction("TEST-MAT", 2)
        main.approve_extraction(
            extraction_id, schemas.ExtractionApprovalIn(), self.db)
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
            and row["url"] == f"/quotations?project={self.project.id}"
            for row in payload["current_projects"]))
        self.assertIn("receivable_aging", payload["insights"])

        production = main.list_production_jobs(self.db)
        self.assertTrue(any(
            row["job_number"] == legacy_job.job_number
            and row["legacy_active"]
            for row in production))


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
        extraction_id = result["extractions"][0]["id"]
        main.approve_extraction(
            extraction_id, schemas.ExtractionApprovalIn(), self.db)
        return extraction_id

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
            project_number=f"SOF-P-MULTI-{self._testMethodName[-8:]}",
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

    def test_approving_one_items_extraction_never_touches_sibling_item(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        door_e1 = self._extraction_for(self.door.id, "DOOR-MAT", 1)

        main.approve_extraction(
            window_e1.id, schemas.ExtractionApprovalIn(), self.db)
        self.db.refresh(door_e1)
        self.assertEqual(
            door_e1.status, "draft",
            "approving the window's extraction must not change the door's")

        main.approve_extraction(door_e1.id, schemas.ExtractionApprovalIn(), self.db)
        self.db.refresh(window_e1)
        self.assertEqual(
            window_e1.status, "approved",
            "approving the door's extraction must not supersede the window's")

    def test_workflow_payload_lists_both_items_with_their_own_summary(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        main.approve_extraction(
            window_e1.id, schemas.ExtractionApprovalIn(), self.db)
        self._extraction_for(self.door.id, "DOOR-MAT", 1)

        workflow = main.get_project_workflow(self.project.id, self.db)
        design_ids = {row["design_id"] for row in workflow["items"]}
        self.assertEqual(design_ids, {self.window.id, self.door.id})

        window_summary = workflow["item_summary"][str(self.window.id)]
        door_summary = workflow["item_summary"][str(self.door.id)]
        self.assertEqual(window_summary["approved_extraction_revision"], 1)
        self.assertIsNone(door_summary["approved_extraction_revision"])

    def test_combined_quote_bundles_both_items_materials(self):
        window_e1 = self._extraction_for(self.window.id, "WIN-MAT", 6)
        door_e1 = self._extraction_for(self.door.id, "DOOR-MAT", 1)
        main.approve_extraction(window_e1.id, schemas.ExtractionApprovalIn(), self.db)
        main.approve_extraction(door_e1.id, schemas.ExtractionApprovalIn(), self.db)

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
        main.approve_extraction(window_e1.id, schemas.ExtractionApprovalIn(), self.db)
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
            job_id=quote.job_id, amount=500, kind="deposit", method="bank"))
        self.db.commit()

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


if __name__ == "__main__":
    unittest.main()
