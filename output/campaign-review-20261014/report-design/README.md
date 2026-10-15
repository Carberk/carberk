# Carberk report design sample

Local, fictional Turkmen report prototype. Open `report.html` through a local HTTP server. The five diagrams are original generic sedan geometry; they are not a model-specific panel map. Uses the existing mobile Carberk logo, Geist faces and brand/neutral tokens. No production app code changed.

From the repository root, run `python output/report-design/build_phone.py` in an environment containing reportlab and svglib. This rebuilds the four-page report, two-page blank workshop sheet, and phone HTML. The generator reads the bundled mobile fonts/logo.

Verified: all five view selectors, marker-to-finding expansion, PDF download target, no page overflow at 320/390/1280 CSS px, Turkmen glyph extraction, and visual rendering of all six PDF pages. The generic detector flagged Geist as common; the font is deliberately retained to match Carberk's shipped mobile identity. Mechanic and fluent Turkmen review remain required for service content.

Current revision follows the native app rather than a separate report brand. See [mobile design analysis](mobile-alignment.md) for source evidence, exact component mappings and prototype limitations. Desktop shows all views beside findings; smaller screens select one view. Both share the same report content and SVG assets.
