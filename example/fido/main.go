package main

import (
	"log"
	"os"

	"github.com/fraugster/cli"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

var envMap = map[string]string{}

func main() {
	buildEnvMap()
	router := setupWebServer()
	ctx := cli.Context()
	go router.RunTLS(":"+envMap["PORT"], envMap["CERTIFICATE_FILE"], envMap["KEY_FILE"])
	<-ctx.Done()
}

func buildEnvMap() {
	var envKeys = []string{
		"PORT",
		"STATIC_FILES_LOCATION",
		"CERTIFICATE_FILE",
		"KEY_FILE",
	}
	for _, key := range envKeys {
		val := os.Getenv(key)
		if val == "" {
			panic(errors.Errorf("Missing environment variable '%s'", key))
		}
		envMap[key] = val
		log.Println("Environment: ", key, ": ", val)
	}
}

func setupWebServer() *gin.Engine {
	router := gin.Default()
	router.Use(static.Serve("/", static.LocalFile(envMap["STATIC_FILES_LOCATION"], true)))
	return router
}
