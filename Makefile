UUID := winter-is-coming@linux
DIST_DIR := dist
BUNDLE := $(DIST_DIR)/$(UUID).shell-extension.zip

.PHONY: all build install uninstall test check clean

all: build

build:
	@mkdir -p $(DIST_DIR)
	gnome-extensions pack . \
		--force \
		--out-dir $(DIST_DIR) \
		--extra-source=prefs.js \
		--extra-source=lib \
		--extra-source=LICENSE \
		--schema=schemas/org.gnome.shell.extensions.winter-is-coming.gschema.xml
	@echo "Built $(BUNDLE)"

install:
	./scripts/install.sh

uninstall:
	./scripts/uninstall.sh

test:
	gjs -m tests/test_snow_world.js

check:
	./scripts/check.sh

clean:
	rm -rf $(DIST_DIR)
