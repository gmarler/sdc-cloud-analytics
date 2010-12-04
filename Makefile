#
# Makefile: top-level makefile
#

#
# Directories
#
TOOLSDIR=tools
JS_SUBDIRS=cmd lib

#
# Tools
#
CSCOPE=cscope
JSL=$(TOOLSDIR)/jsl
JSSTYLE=$(TOOLSDIR)/jsstyle

#
# Files
#
JSL_CONF_MAIN = tools/jsl_support/jsl.conf
JSL_CONF_WEB = tools/jsl_support/jsl.web.conf
JS_FILES = `find $(JS_SUBDIRS) -name '*.js'` demo/basicvis/cademo.js
WEBJS_FILES = demo/basicvis/caflot.js

#
# Targets
#
all:
	

check-jsl: check-jsl-main check-jsl-web

check-jsl-main:
	$(JSL) --conf=$(JSL_CONF_MAIN) $(JS_FILES)

check-jsl-web:
	$(JSL) --conf=$(JSL_CONF_WEB) $(WEBJS_FILES)

check-jsstyle:
	$(JSSTYLE) $(JS_FILES) $(WEBJS_FILES)

check: check-jsstyle check-jsl
	@echo check okay

cscope.files:
	find deps $(JS_SUBDIRS) -name '*.js' -o -name '*.c' -o -name '*.cpp' \
	    -o -name '*.cc' -o -name '*.h' > cscope.files

xref: cscope.files
	$(CSCOPE) -bqR

.PHONY: cscope.files
