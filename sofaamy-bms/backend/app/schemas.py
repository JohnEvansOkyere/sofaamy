"""Pydantic request/response schemas."""
from pydantic import BaseModel


class ClientOut(BaseModel):
    id: int
    name: str
    contact: str
    phone: str
    location: str
    type: str
    class Config: from_attributes = True


class MaterialOut(BaseModel):
    id: int
    code: str
    name: str
    category: str
    unit: str
    unit_price: float
    stock: float
    reorder_level: float
    class Config: from_attributes = True


class JobOut(BaseModel):
    id: int
    job_number: str
    product: str
    stage: str
    progress: int
    paid: str
    deposit_percent: float = 80
    class Config: from_attributes = True


class QuoteIn(BaseModel):
    client_name: str
    product: str
    width_mm: int
    height_mm: int
    panels: int = 1
    opening: str = "fixed"
    glass: str = "clear"


class QuoteOut(BaseModel):
    id: int
    quote_number: str
    client_name: str
    product: str
    total: float
    deposit_percent: float = 80
    status: str
    class Config: from_attributes = True


class PriceRequest(BaseModel):
    width_mm: int
    height_mm: int
    panels: int = 1
    opening: str = "fixed"
    glass: str = "clear"


class DesignCell(BaseModel):
    glass: str = "clear"
    opening: str = "fixed"
    panels: int = 1
    itemQty: int = 1
    rateKey: str = ""
    ratePerM2: float | None = None
    # frameless panel type (fixed|door|hinged|slider) or curtain wall
    # bay type (vision|spandrel|vent); unused by framed designs
    type: str = ""
    # Optional divider layout applied only to this section, rather than the
    # entire outer frame grid.
    localDivider: dict | None = None


class DesignIn(BaseModel):
    category: str = "frame"          # frame | frameless | curtainwall
    name: str = "Custom Design"
    ref: str = ""
    qty: int = 1
    location: str = ""
    system: str = "standard"
    finishType: str = "powder"
    width: int
    height: int
    cols: int = 1
    rows: int = 1
    frame: str = "mill"
    colWidths: list[int] = []
    rowHeights: list[int] = []
    cells: list[DesignCell]
    # Project-level Frame accessory edits. Each row may override a catalogue
    # code's quantity or add a custom item; removed rows are retained so the
    # project can be reopened without losing the edit history in its payload.
    accessoryOverrides: list[dict] = []
    # Per-unit manual fabrication additions such as a curve/template piece
    # or a site-specific member not covered by the standard geometry recipe.
    customCutPieces: list[dict] = []
    # Internal site evidence. Images are resized in the browser before being
    # stored with the saved design JSON; they are not exposed on client share
    # links by default.
    siteImages: list[dict] = []
    # Frame measurement and commercial metadata
    measurementStatus: str = "preliminary"
    measurementSource: str = ""
    measuredBy: str = ""
    measurementDate: str = ""
    siteNotes: str = ""
    # Customer quotation metadata. Optional because a walk-in client may not
    # have supplied contact details at first measurement.
    clientPhone: str = ""
    clientEmail: str = ""
    jobDescription: str = ""
    colourDescription: str = ""
    quoteValidDays: int = 3
    # Project-specific internal cost floor copied from the approved material
    # costing/BOQ sheet. This is a project total, before customer taxes.
    # Zero means use the calculated working floor.
    costFloorOverride: float = 0
    depositPercent: float = 80
    discountPercent: float = 0
    getfNhisPercent: float = 5
    vatPercent: float = 15
    # Client visualiser presentation preferences. These are saved with the
    # design so a shared project opens with the same wall/finish viewpoint.
    wallColor: str = "#ded8cc"
    floorColor: str = "#cfd6dc"
    customFrameColor: str = ""
    visualView: str = "orbit"
    # frameless-only
    glassId: str = "temp10"
    overPanel: bool = False
    doorH: int = 2100
    flSystem: str = "klpatches"     # swing hardware: klpatches|nondigging|sanhe|spider
    slideSystem: str = "scl"        # sliding hardware: scl|sh005
    cornerAfter: int = -1           # L-shape: last bay on the main wall (-1 = straight)
    scene: str = "shopfront"        # realistic 3D context: shopfront|bathroom

    def engine_dict(self) -> dict:
        """Map to the pricing-engine payload (snake_case section arrays)."""
        d = self.model_dump()
        d["col_widths"] = d.pop("colWidths")
        d["row_heights"] = d.pop("rowHeights")
        d["glass_id"] = d.pop("glassId")
        d["over_panel"] = d.pop("overPanel")
        d["door_h"] = d.pop("doorH")
        d["fl_system"] = d.pop("flSystem")
        d["slide_system"] = d.pop("slideSystem")
        d["corner_after"] = d.pop("cornerAfter")
        d["measurement_status"] = d.pop("measurementStatus")
        d["measurement_source"] = d.pop("measurementSource")
        d["measured_by"] = d.pop("measuredBy")
        d["measurement_date"] = d.pop("measurementDate")
        d["site_notes"] = d.pop("siteNotes")
        d["accessory_overrides"] = d.pop("accessoryOverrides")
        d["custom_cut_pieces"] = d.pop("customCutPieces")
        d["site_images"] = d.pop("siteImages")
        d["client_phone"] = d.pop("clientPhone")
        d["client_email"] = d.pop("clientEmail")
        d["job_description"] = d.pop("jobDescription")
        d["colour_description"] = d.pop("colourDescription")
        d["quote_valid_days"] = d.pop("quoteValidDays")
        d["cost_floor_override"] = d.pop("costFloorOverride")
        d["deposit_percent"] = d.pop("depositPercent")
        d["discount_percent"] = d.pop("discountPercent")
        d["getf_nhis_percent"] = d.pop("getfNhisPercent")
        d["vat_percent"] = d.pop("vatPercent")
        d["wall_color"] = d.pop("wallColor")
        d["floor_color"] = d.pop("floorColor")
        d["custom_frame_color"] = d.pop("customFrameColor")
        d["visual_view"] = d.pop("visualView")
        for cell in d.get("cells", []):
            if "itemQty" in cell:
                cell["item_qty"] = cell.pop("itemQty")
            if "rateKey" in cell:
                cell["rate_key"] = cell.pop("rateKey")
            if "ratePerM2" in cell:
                cell["rate_per_m2"] = cell.pop("ratePerM2")
        for item in d.get("accessory_overrides", []):
            if "unitPrice" in item:
                item["unit_price"] = item.pop("unitPrice")
        for piece in d.get("custom_cut_pieces", []):
            if "sourceMm" in piece:
                piece["source_mm"] = piece.pop("sourceMm")
            if "adjustmentMm" in piece:
                piece["adjustment_mm"] = piece.pop("adjustmentMm")
            if "lengthMm" in piece:
                piece["length_mm"] = piece.pop("lengthMm")
        return d


class DesignQuoteIn(BaseModel):
    client_name: str = ""
    project_id: int | None = None
    design: DesignIn


class PaymentIn(BaseModel):
    amount: float
    kind: str = "deposit"       # deposit|balance|other
    method: str = "momo"        # momo|bank|cash|cheque
    ref: str = ""
    who: str = "Esi Quaye"      # accounts user (until auth lands)


class QcIn(BaseModel):
    result: str                 # pass|rework
    score: int = 100
    notes: str = ""
    checklist: list[dict] = []
    inspector: str = "Yaw Darko"


class DispatchIn(BaseModel):
    driver: str
    vehicle: str = ""
    who: str = "Kwame Mensah"


class AdvanceIn(BaseModel):
    who: str = "Kwame Mensah"


class QuoteStatusIn(BaseModel):
    status: str                 # Sent|Accepted|Declined
    who: str = "Kwame Mensah"


class ClientIn(BaseModel):
    name: str
    contact: str = ""
    phone: str = ""
    location: str = ""
    type: str = "company"


class ProjectIn(BaseModel):
    name: str
    client_name: str = ""
    client_id: int | None = None
    location: str = ""


class ReceiveStockIn(BaseModel):
    qty: float
    note: str = ""
    who: str = "Kojo Antwi"


class DemandPiece(BaseModel):
    profile: str
    member: str = ""
    length_mm: int
    qty: int = 1


class OptimizeRequest(BaseModel):
    pieces: list[DemandPiece]
    kerf_mm: int = 5
