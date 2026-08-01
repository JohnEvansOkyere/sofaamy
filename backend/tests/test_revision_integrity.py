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


class RevisionIntegrityTest(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        main.engine.dispose()
        TEST_DATABASE_DIR.cleanup()

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


if __name__ == "__main__":
    unittest.main()
