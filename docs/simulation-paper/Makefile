# Makefile — OpenBilliards simulator-paper manuscript
#
# Toolchain preference:
#   1. latexmk   (TeX Live; the canonical driver if present)
#   2. tectonic  (self-contained XeTeX engine; runs bibtex passes itself)
#   3. pdflatex + bibtex manual cycle (documented fallback)
#
# Gates (main manuscript and Supplementary Material document):
#   make            — builds main.pdf AND supplement.pdf, zero LaTeX errors
#   make supplement — builds supplement.pdf only (after main.pdf: the
#                     supplement's cross-references into the main text
#                     resolve from main.aux via the xr package)
#   make check      — additionally asserts zero undefined citations /
#                     references in BOTH documents and runs the
#                     bibliography sanity checker; a document whose
#                     build log is missing is rebuilt first, even when
#                     its committed PDF looks up to date

PDF := main.pdf
SUPP := supplement.pdf
# figures are manuscript inputs: adding/updating an
# F<n>.pdf must trigger a rebuild, else the placeholder/stale graphic
# survives in main.pdf
FIGS := $(wildcard figures/F*.pdf)
# supplement-only sources are excluded from the main manuscript's
# dependency set: editing an appendix must not mark main.pdf
# stale.
SUPPONLY := $(wildcard sections/appendix-*.tex) \
            $(wildcard sections/supplement-*.tex)
SRC := main.tex references.bib \
       $(filter-out $(SUPPONLY),$(wildcard sections/*.tex)) $(FIGS)
SUPPSRC := supplement-main.tex references.bib \
           $(wildcard sections/appendix-*.tex) \
           $(wildcard sections/supplement-*.tex)

.PHONY: all supplement check clean distclean

all: $(PDF) $(SUPP)

supplement: $(SUPP)

$(PDF): $(SRC)
	@if command -v latexmk >/dev/null 2>&1; then \
		echo "[build] latexmk"; \
		latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex; \
	elif command -v tectonic >/dev/null 2>&1; then \
		echo "[build] tectonic (latexmk unavailable)"; \
		tectonic --keep-logs --keep-intermediates main.tex; \
	elif command -v pdflatex >/dev/null 2>&1; then \
		echo "[build] pdflatex+bibtex fallback"; \
		pdflatex -interaction=nonstopmode -halt-on-error main.tex && \
		bibtex main && \
		pdflatex -interaction=nonstopmode -halt-on-error main.tex && \
		pdflatex -interaction=nonstopmode -halt-on-error main.tex; \
	else \
		echo "ERROR: no LaTeX toolchain found (latexmk / tectonic / pdflatex)."; \
		echo "Install one, e.g. 'brew install tectonic'."; \
		exit 1; \
	fi

# supplement.pdf builds AFTER main.pdf: the xr package resolves the
# supplement's \ref{...} into the main text from main.aux (kept by
# latexmk / tectonic --keep-intermediates). The built PDF is
# supplement-main.pdf; the deliverable name is supplement.pdf.
$(SUPP): $(SUPPSRC) $(PDF)
	@# main.aux is a rebuildable prerequisite: after `make
	@# clean`, main.pdf survives but the aux xr needs is gone — force the
	@# main build instead of failing.
	@test -f main.aux || { \
		echo "[migrate] main.aux missing — rebuilding the main manuscript"; \
		$(MAKE) -B $(PDF); }
	@if command -v latexmk >/dev/null 2>&1; then \
		echo "[build] latexmk (supplement)"; \
		latexmk -pdf -interaction=nonstopmode -halt-on-error supplement-main.tex; \
	elif command -v tectonic >/dev/null 2>&1; then \
		echo "[build] tectonic (supplement; latexmk unavailable)"; \
		tectonic --keep-logs --keep-intermediates supplement-main.tex; \
	elif command -v pdflatex >/dev/null 2>&1; then \
		echo "[build] pdflatex+bibtex fallback (supplement)"; \
		pdflatex -interaction=nonstopmode -halt-on-error supplement-main.tex && \
		bibtex supplement-main && \
		pdflatex -interaction=nonstopmode -halt-on-error supplement-main.tex && \
		pdflatex -interaction=nonstopmode -halt-on-error supplement-main.tex; \
	else \
		echo "ERROR: no LaTeX toolchain found (latexmk / tectonic / pdflatex)."; \
		exit 1; \
	fi
	@cp supplement-main.pdf $(SUPP)

check: $(PDF) $(SUPP)
	@# A fresh checkout or source archive gives the committed PDFs the
	@# same timestamps as their sources, so make skips both builds and no
	@# log exists to grep (`make clean` leaves the same state). Rebuild
	@# each document whose log is missing, whatever the PDFs' freshness:
	@# the main document first, since the supplement reads main.aux.
	@test -f main.log -a -f main.aux || { \
		echo "[check] main.log or main.aux missing — rebuilding the main manuscript"; \
		$(MAKE) -W main.tex $(PDF); }
	@test -f supplement-main.log || { \
		echo "[check] supplement-main.log missing — rebuilding the supplement"; \
		$(MAKE) -W supplement-main.tex $(SUPP); }
	@test -f main.log || { \
		echo "FAIL: main.log is still missing after the rebuild"; exit 1; }
	@echo "[gate] LaTeX errors in main.log"
	@if grep -E '^!' main.log; then echo "FAIL: LaTeX errors"; exit 1; fi
	@echo "[gate] undefined citations / references (main)"
	@if grep -E "Citation .* undefined|Reference .* undefined|There were undefined" main.log; then \
		echo "FAIL: undefined citations/references"; exit 1; fi
	@test -f supplement-main.log || { \
		echo "FAIL: supplement-main.log is still missing after the rebuild"; exit 1; }
	@echo "[gate] LaTeX errors in supplement-main.log"
	@if grep -E '^!' supplement-main.log; then echo "FAIL: LaTeX errors (supplement)"; exit 1; fi
	@echo "[gate] undefined citations / references (supplement)"
	@if grep -E "Citation .* undefined|Reference .* undefined|There were undefined" supplement-main.log; then \
		echo "FAIL: undefined citations/references (supplement)"; exit 1; fi
	@echo "[gate] bibliography sanity (fields present; every entry cited)"
	@python3 tools/bib_sanity.py
	@echo "PASS: all manuscript gates green (main + supplement)"

clean:
	rm -f main.aux main.bbl main.blg main.log main.out main.spl main.toc \
	      main.fls main.fdb_latexmk main.xdv \
	      supplement-main.aux supplement-main.bbl supplement-main.blg \
	      supplement-main.log supplement-main.out supplement-main.spl \
	      supplement-main.fls supplement-main.fdb_latexmk \
	      supplement-main.xdv supplement-main.pdf sections/*.aux

distclean: clean
	rm -f $(PDF) $(SUPP)
