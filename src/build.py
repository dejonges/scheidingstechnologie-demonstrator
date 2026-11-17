"""Bouwt index.html (één zelfstandig bestand) uit template.html, core.js, extra.js en ui.js."""
import pathlib
d = pathlib.Path(__file__).parent
t = (d / "template.html").read_text()
t = (t.replace("/*CORE*/", (d / "core.js").read_text())
      .replace("/*EXTRA*/", (d / "extra.js").read_text())
      .replace("/*UI*/", (d / "ui.js").read_text()))
(d.parent / "index.html").write_text(t)
print("index.html:", len(t), "tekens")
