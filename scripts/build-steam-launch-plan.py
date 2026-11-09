"""Build the owner-facing launch plan from its checked Markdown source."""
from pathlib import Path
from html import escape
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/steam/LAUNCH_PLAN.md"
OUTPUT = ROOT / "output/pdf/Aegis-Vector-Steam-Launch-Plan.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#122239")
CYAN = colors.HexColor("#087F96")
INK = colors.HexColor("#26374B")
MUTED = colors.HexColor("#627184")
PALE = colors.HexColor("#EFF6F8")
RULE = colors.HexColor("#D4E0E6")
PAGE_W, PAGE_H = A4
WIDTH = PAGE_W - 88

styles = {
    "title": ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=24,
        leading=28, textColor=NAVY, spaceAfter=12),
    "h2": ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=19,
        leading=23, textColor=NAVY, spaceAfter=11),
    "h3": ParagraphStyle("Subsection", fontName="Helvetica-Bold", fontSize=11.3,
        leading=15, textColor=CYAN, spaceBefore=9, spaceAfter=5, keepWithNext=True),
    "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10,
        leading=13.8, textColor=INK, spaceAfter=6),
    "bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=10,
        leading=13.8, textColor=INK, spaceAfter=6, leftIndent=11, firstLineIndent=0),
    "table": ParagraphStyle("Cell", fontName="Helvetica", fontSize=9.2,
        leading=12.3, textColor=INK),
    "th": ParagraphStyle("HeadCell", fontName="Helvetica-Bold", fontSize=9.1,
        leading=12.2, textColor=colors.white),
    "small": ParagraphStyle("Small", fontName="Helvetica", fontSize=8.6,
        leading=11.6, textColor=MUTED, spaceAfter=6),
}


def inline(raw):
    # Markdown is trusted project text; escape before producing ReportLab markup.
    saved = []
    def link(match):
        label, url = match.groups()
        text = escape(label)
        if url.startswith("https://"):
            text = f'<link href="{escape(url, quote=True)}" color="#087F96"><u>{text}</u></link>'
        else:
            text = f'<b>{text}</b>'
        saved.append(text)
        return f"LINKTOKEN{len(saved)-1}END"
    raw = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, raw)
    raw = escape(raw)
    raw = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", raw)
    raw = re.sub(r"`([^`]+)`", r'<font name="Courier" size="9">\1</font>', raw)
    for i, text in enumerate(saved):
        raw = raw.replace(f"LINKTOKEN{i}END", text)
    return raw


def para(text, kind="body", bullet=None):
    return Paragraph(inline(text), styles[kind], bulletText=bullet)


def table(lines):
    rows = [[part.strip() for part in line.strip().strip("|").split("|")] for line in lines]
    rows = [r for r in rows if not all(re.fullmatch(r":?-+:?", c) for c in r)]
    cols = len(rows[0])
    if cols == 2:
        widths = [WIDTH * .23, WIDTH * .77]
    elif rows[0][0] == "Area":
        widths = [WIDTH * .34, WIDTH * .10, WIDTH * .56]
    elif rows[0][0] == "Phase":
        widths = [WIDTH * .31, WIDTH * .22, WIDTH * .47]
    else:
        widths = [WIDTH * .34, WIDTH * .19, WIDTH * .47]
    cells = [[para(c, "th" if i == 0 else "table") for c in row] for i, row in enumerate(rows)]
    obj = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
    obj.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PALE, colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, -1), (-1, -1), .6, RULE),
    ]))
    return [obj, Spacer(1, 8)]


def page_decor(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 8, PAGE_W, 8, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(44, PAGE_H - 31, "AEGIS VECTOR")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - 44, PAGE_H - 31, "STEAM LAUNCH PLAN  /  02 NOV 2026")
    canvas.setStrokeColor(RULE)
    canvas.line(44, 36, PAGE_W - 44, 36)
    canvas.setFont("Helvetica", 7.6)
    canvas.drawString(44, 23, "PLANNING DOCUMENT - NOT A RELEASE APPROVAL")
    canvas.drawRightString(PAGE_W - 44, 23, f"{doc.page} / 6")
    canvas.restoreState()


story = []
sections = SOURCE.read_text().split("<!-- PAGE_BREAK -->")
for index, section in enumerate(sections):
    if index:
        story.append(PageBreak())
    lines = section.strip().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("| "):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            story.extend(table(block))
            continue
        if line.startswith("# "):
            story.append(para("Aegis Vector", "title"))
            story.append(para("A practical route to a Windows-first Steam launch", "small"))
        elif line.startswith("## "):
            story.append(para(line[3:], "h2"))
        elif line.startswith("### "):
            story.append(para(line[4:], "h3"))
        elif line.startswith("- "):
            story.append(para(line[2:], "bullet", "-"))
        elif re.match(r"^[0-9]+\. ", line):
            number, text = line.split(". ", 1)
            story.append(para(text, "bullet", number + "."))
        else:
            story.append(para(line, "small" if line.startswith("**Working kit:") else "body"))
        i += 1

doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=44, rightMargin=44,
    topMargin=48, bottomMargin=47, title="Aegis Vector - Steam Launch Plan",
    author="Prepared for Tibor Banach", subject="Windows-first feasibility, release gates and owner handoff")
doc.addPageTemplates(PageTemplate(id="Main", frames=[Frame(44, 47, WIDTH, PAGE_H - 98,
    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=page_decor))
doc.build(story)
print(OUTPUT)
