"""
Generate a downloadable PDF of the home-construction packages for a given
public package link. Sales/Pre-Sales include this PDF alongside the share-link
WhatsApp message for prospects who can't open public URLs.
"""
import io
from datetime import datetime
from typing import Any, Dict, List

from fpdf import FPDF


# Brand colours (RGB)
BRAND_AMBER = (217, 119, 6)
BRAND_DARK = (17, 24, 39)
BRAND_GRAY = (107, 114, 128)
BRAND_BG = (255, 251, 235)


class _PackagePDF(FPDF):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(left=14, top=14, right=14)
        # fpdf2 ships built-in core fonts only; use Helvetica everywhere.

    def header(self):
        self.set_fill_color(*BRAND_AMBER)
        self.rect(0, 0, self.w, 6, "F")
        self.set_xy(14, 8)
        self.set_text_color(*BRAND_DARK)
        self.set_font("Helvetica", "B", 16)
        self.cell(0, 6, _safe("Urban Space Builders"), new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*BRAND_GRAY)
        self.cell(0, 4, _safe("myhomeusb.com  -  Premium Home Construction Packages"), new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*BRAND_GRAY)
        self.cell(0, 4, _safe(f"Page {self.page_no()}  -  Generated on {datetime.now().strftime('%d %b %Y')}"), align="C")


def _safe(s: Any) -> str:
    """fpdf2 with core fonts is latin-1 only — strip / replace incompatible chars."""
    if s is None:
        return ""
    return str(s).encode("latin-1", "replace").decode("latin-1")


def build_package_pdf(client_name: str | None, packages: List[Dict[str, Any]]) -> bytes:
    pdf = _PackagePDF(format="A4")
    pdf.add_page()

    # Greeting
    pdf.set_text_color(*BRAND_DARK)
    pdf.set_font("Helvetica", "B", 14)
    greeting = f"Hi {client_name.split()[0]}!" if client_name else "Hello!"
    pdf.cell(0, 8, _safe(greeting), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*BRAND_GRAY)
    pdf.multi_cell(0, 5,
        _safe("Below are our curated construction packages. Each package is "
              "all-inclusive — design to handover. Pricing is per sqft of built area."))
    pdf.ln(2)

    if not packages:
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 8, _safe("Packages coming soon — please reach out to your relationship manager."))
        return bytes(pdf.output())

    for idx, pkg in enumerate(packages):
        # Card header (band)
        pdf.set_fill_color(*BRAND_AMBER)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 12)
        title = (pkg.get("name") or pkg.get("short_name") or "Package").upper()
        pdf.cell(0, 8, " " + _safe(title), new_x="LMARGIN", new_y="NEXT", fill=True)

        # Price chip
        price = pkg.get("price_per_sqft")
        orig = pkg.get("original_price_per_sqft")
        pdf.set_fill_color(*BRAND_BG)
        pdf.set_text_color(*BRAND_DARK)
        pdf.set_font("Helvetica", "B", 14)
        if price:
            line = f"Rs {int(price):,}"
            if orig and orig > price:
                line += f"  /sqft   (was Rs {int(orig):,})"
            else:
                line += "  /sqft"
            pdf.cell(0, 9, " " + _safe(line), new_x="LMARGIN", new_y="NEXT", fill=True)
        pdf.ln(2)

        # Sections
        for sec in pkg.get("sections") or []:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*BRAND_DARK)
            pdf.cell(0, 6, _safe(sec.get("title") or ""), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*BRAND_GRAY)
            for b in sec.get("bullets") or []:
                pdf.multi_cell(0, 5, _safe(f"  - {b}"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

        if idx != len(packages) - 1:
            pdf.ln(3)
            pdf.set_draw_color(229, 231, 235)
            pdf.line(14, pdf.get_y(), pdf.w - 14, pdf.get_y())
            pdf.ln(4)
            # New page if we're more than 70% down
            if pdf.get_y() > pdf.h - 70:
                pdf.add_page()

    # Footer call-to-action
    pdf.ln(6)
    pdf.set_fill_color(240, 253, 244)
    pdf.set_text_color(*BRAND_DARK)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, _safe("  Want to know more? Visit us — Mon-Sat, 10am-6pm."), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BRAND_GRAY)
    pdf.cell(0, 5, _safe("  Reply on WhatsApp to schedule a visit, or open the package link to book online."))

    out = pdf.output()
    return bytes(out)


# Convenience wrapper exposed to the FastAPI router.
def render_package_pdf_bytes(public_data: Dict[str, Any]) -> bytes:
    return build_package_pdf(
        client_name=public_data.get("client_name"),
        packages=public_data.get("packages") or [],
    )
