# Builds the author's guide as one book, set up like alan-docs builds the manual
# (manual/html_build.sh there), so it should look familiar.
# _assets/ holds copies from alan-docs' _assets/rouge/, as of 1e800f9: the Alan
# lexer and its adapter, and the extra CSS. The PDF uses asciidoctor-pdf's default
# theme. Needs the gems alan-docs pins: asciidoctor 2.0.17, rouge 3.26.0,
# asciidoctor-pdf 2.3.24.

ASSETS := $(CURDIR)/_assets
CHAPTERS := $(filter-out guide.adoc,$(wildcard *.adoc))

all: html pdf

html: guide.html
pdf: guide.pdf

guide.html: guide.adoc $(CHAPTERS)
	asciidoctor \
		--safe-mode unsafe \
		--verbose \
		-r $(ASSETS)/custom-rouge-adapter.rb \
		-a source-highlighter=rouge \
		-a rouge-style=thankful_eyes \
		-a docinfodir=$(ASSETS) \
		-a docinfo=shared-head \
		-a data-uri \
		-a icons=font \
		-a linkattrs \
		-a reproducible \
		-a sectanchors \
		-a toc=left \
		-o $@ $<

guide.pdf: guide.adoc $(CHAPTERS)
	asciidoctor-pdf \
		--safe-mode unsafe \
		--verbose \
		-r rouge \
		-r $(ASSETS)/alan3.rb \
		-a source-highlighter=rouge \
		-a reproducible \
		-o $@ $<

check:
	./check.sh

clean:
	rm -f guide.html guide.pdf

.PHONY: all html pdf check clean
