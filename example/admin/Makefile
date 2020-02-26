
cloud-build:
	GOOS=linux go build -o ./cmd/builds/ofte-admin-demo-linux ./cmd/main.go
	@echo --- If next commands fail, execute: docker login registry.gitlab.com
	@echo --- Enter your username and password/personal access token for gitlab to access the docker registry
	docker build . -t registry.gitlab.com/ofte/docker-registry/ofte-admin-demo:latest

deploy:
	@echo --- If next commands fail, execute: docker login registry.gitlab.com
	@echo --- Enter your username and password/personal access token for gitlab to access the docker registry
	docker push registry.gitlab.com/ofte/docker-registry/ofte-admin-demo:latest

.PHONY: cloud-build deploy
