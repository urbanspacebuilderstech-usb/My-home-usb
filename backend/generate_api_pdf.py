"""Generate a PDF report of all API endpoints."""
import re
from fpdf import FPDF


class APIPdfReport(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 30, 30)
        self.cell(0, 10, "My Home USB - API Endpoints Report", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(0, 102, 204)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(0, 70, 150)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def sub_section(self, title):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(60, 60, 60)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def table_header(self):
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(0, 102, 204)
        self.set_text_color(255, 255, 255)
        self.cell(18, 6, "Method", border=1, fill=True, align="C")
        self.cell(82, 6, "Endpoint", border=1, fill=True, align="C")
        self.cell(90, 6, "Purpose", border=1, fill=True, align="C")
        self.ln()

    def table_row(self, method, endpoint, purpose, row_idx):
        self.set_font("Helvetica", "", 7)
        if row_idx % 2 == 0:
            self.set_fill_color(240, 245, 255)
        else:
            self.set_fill_color(255, 255, 255)

        method_colors = {
            "GET": (40, 167, 69),
            "POST": (0, 123, 255),
            "PATCH": (255, 165, 0),
            "DELETE": (220, 53, 69),
            "PUT": (108, 117, 125),
        }
        r, g, b = method_colors.get(method.split("/")[0].strip(), (80, 80, 80))
        self.set_text_color(r, g, b)
        self.cell(18, 5.5, method, border=1, fill=True, align="C")
        self.set_text_color(30, 30, 30)
        self.set_font("Courier", "", 6.5)
        self.cell(82, 5.5, endpoint, border=1, fill=True)
        self.set_font("Helvetica", "", 7)
        self.cell(90, 5.5, purpose, border=1, fill=True)
        self.ln()


def parse_md_and_generate_pdf(md_path: str, output_path: str):
    with open(md_path, "r") as f:
        lines = f.readlines()

    pdf = APIPdfReport()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title info
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 6, "Total APIs: 528 endpoints across 10 route files", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    row_idx = 0
    in_table = False
    current_section = ""

    for line in lines:
        line = line.rstrip("\n")

        # Section headers (## )
        m_section = re.match(r"^## \d+\.\s+(.+)", line)
        if m_section:
            in_table = False
            row_idx = 0
            current_section = m_section.group(1).split("—")[0].strip()
            if pdf.get_y() > 240:
                pdf.add_page()
            pdf.ln(3)
            pdf.section_title(current_section)
            continue

        # Subsection headers (### )
        m_sub = re.match(r"^### (.+)", line)
        if m_sub:
            in_table = False
            row_idx = 0
            sub_title = m_sub.group(1).strip()
            if pdf.get_y() > 250:
                pdf.add_page()
            pdf.sub_section(sub_title)
            continue

        # Table header row
        if line.startswith("| Method"):
            in_table = True
            row_idx = 0
            if pdf.get_y() > 255:
                pdf.add_page()
            pdf.table_header()
            continue

        # Skip separator
        if line.startswith("||---") or line.startswith("|---"):
            continue

        # Table data rows
        if in_table and line.startswith("|"):
            parts = [p.strip() for p in line.split("|")]
            parts = [p for p in parts if p]
            if len(parts) >= 3:
                method = parts[0].replace("`", "")
                endpoint = parts[1].replace("`", "")
                purpose = parts[2]
                if pdf.get_y() > 270:
                    pdf.add_page()
                    pdf.table_header()
                pdf.table_row(method, endpoint, purpose, row_idx)
                row_idx += 1
            continue

        # Summary table at the end
        if "| Module" in line or "| **Total**" in line:
            continue

        if line.startswith("---"):
            in_table = False
            pdf.ln(2)

    # Summary section
    pdf.add_page()
    pdf.section_title("Summary by Module")
    pdf.ln(2)

    summary_data = [
        ("Auth & Security", "auth.py", "16", "Login, invites, password management"),
        ("CRM & Sales", "crm.py", "77", "Pipeline, leads, RE, marketing, site visits"),
        ("Operations", "operations.py", "112", "CRE, planning, work orders, HR, accounts"),
        ("Financial", "financial.py", "73", "Income, expenses, cashbook, vendors"),
        ("Site Operations", "site_ops.py", "56", "Site engineer, PM, material/labour"),
        ("Procurement", "procurement.py", "43", "Pricing, POs, transit, credit"),
        ("Projects", "projects.py", "112", "Projects, BOQ, payments, scope"),
        ("Architecture", "architect.py", "13", "Site plans, design files"),
        ("Contractors", "contractors.py", "22", "Contractors, attendance, inventory"),
        ("Files", "files.py", "4", "File upload/download"),
    ]

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(0, 102, 204)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(40, 6, "Module", border=1, fill=True, align="C")
    pdf.cell(30, 6, "File", border=1, fill=True, align="C")
    pdf.cell(15, 6, "APIs", border=1, fill=True, align="C")
    pdf.cell(105, 6, "Key Features", border=1, fill=True, align="C")
    pdf.ln()

    for i, (module, file, count, features) in enumerate(summary_data):
        pdf.set_font("Helvetica", "", 8)
        bg = (240, 245, 255) if i % 2 == 0 else (255, 255, 255)
        pdf.set_fill_color(*bg)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(40, 5.5, module, border=1, fill=True)
        pdf.set_font("Courier", "", 7)
        pdf.cell(30, 5.5, file, border=1, fill=True, align="C")
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(15, 5.5, count, border=1, fill=True, align="C")
        pdf.set_font("Helvetica", "", 7.5)
        pdf.cell(105, 5.5, features, border=1, fill=True)
        pdf.ln()

    # Total row
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(0, 70, 150)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(70, 7, "TOTAL", border=1, fill=True, align="C")
    pdf.cell(15, 7, "528", border=1, fill=True, align="C")
    pdf.cell(105, 7, "", border=1, fill=True)
    pdf.ln()

    # 3rd party integrations
    pdf.ln(6)
    pdf.section_title("3rd Party Integrations")
    integrations = [
        ("MongoDB Atlas", "Primary database"),
        ("Google Sheets API", "Lead import/export/sync"),
        ("Resend", "Email notifications"),
        ("Emergent Object Storage", "File uploads"),
        ("Leaflet/OpenStreetMap", "Location mapping"),
        ("jsPDF / jspdf-autotable", "PDF generation"),
    ]
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(0, 102, 204)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(60, 6, "Service", border=1, fill=True, align="C")
    pdf.cell(130, 6, "Purpose", border=1, fill=True, align="C")
    pdf.ln()

    for i, (svc, purpose) in enumerate(integrations):
        pdf.set_font("Helvetica", "", 8)
        bg = (240, 245, 255) if i % 2 == 0 else (255, 255, 255)
        pdf.set_fill_color(*bg)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(60, 5.5, svc, border=1, fill=True)
        pdf.cell(130, 5.5, purpose, border=1, fill=True)
        pdf.ln()

    pdf.output(output_path)
    return output_path


if __name__ == "__main__":
    output = parse_md_and_generate_pdf(
        "/app/memory/API_REPORT.md",
        "/app/backend/static/api_report.pdf"
    )
    print(f"PDF generated: {output}")
