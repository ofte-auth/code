check: build
	golint ./... | grep -v /vendor/ || true

deploy:
	GOOS=linux go build -o ./build/portal
	docker build ./ -t registry.gitlab.com/ofte/code:latest
	@echo --- If next command fails execute: docker login registry.gitlab.com
	@echo --- Enter your username and password/personal access token for gitlab to access the docker registry
	docker push registry.gitlab.com/ofte/code:latest

.PHONY: build 
