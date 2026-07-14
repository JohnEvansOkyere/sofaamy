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
    # frameless panel type (fixed|door|hinged|slider) or curtain wall
    # bay type (vision|spandrel|vent); unused by framed designs
    type: str = ""


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
    # frameless-only
    glassId: str = "temp10"
    overPanel: bool = False
    doorH: int = 2100

    def engine_dict(self) -> dict:
        """Map to the pricing-engine payload (snake_case section arrays)."""
        d = self.model_dump()
        d["col_widths"] = d.pop("colWidths")
        d["row_heights"] = d.pop("rowHeights")
        d["glass_id"] = d.pop("glassId")
        d["over_panel"] = d.pop("overPanel")
        d["door_h"] = d.pop("doorH")
        return d


class DesignQuoteIn(BaseModel):
    client_name: str = ""
    design: DesignIn


class DemandPiece(BaseModel):
    profile: str
    member: str = ""
    length_mm: int
    qty: int = 1


class OptimizeRequest(BaseModel):
    pieces: list[DemandPiece]
    kerf_mm: int = 5
