test: build
	docker run --rm -it spchat:latest npm test
.PHONY: test

build:
	docker build -t spchat:latest .
.PHONY: build

publish: build
	docker tag spchat:latest filindm/spchat:`git describe --always`
	docker push filindm/spchat:`git describe --always`
.PHONY: publish
