package main

import (
	"fmt"
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
	ctx := cli.Context()
	router, err := setupWebServer()
	if err != nil {
		log.Fatal("Error setting up webserver", err)
	}
	go router.RunTLS(":"+envMap["PORT"], envMap["CERTIFICATE_FILE"], envMap["KEY_FILE"])
	<-ctx.Done()
}

func buildEnvMap() {
	var envKeys = []string{
		"PORT",
		"OFTE_ADMIN_ENDPOINT",
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

func setupWebServer() (*gin.Engine, error) {
	router := gin.Default()
	router.Use(static.Serve("/", static.LocalFile(envMap["STATIC_FILES_LOCATION"], true)))
	router.GET("/lib/env.js", handleJSEnv)
	return router, nil
}

func handleJSEnv(ctx *gin.Context) {
	value := fmt.Sprintf(jsTemplate, envMap["OFTE_ADMIN_ENDPOINT"])
	ctx.Writer.WriteString(value)
	ctx.Header("Content-Type", "application/javascript")
	ctx.AbortWithStatus(200)
}

const jsTemplate = `
function getEnvironmentVariable(envvar) {
	switch (envvar) {
	case 'OFTE_ADMIN_ENDPOINT':
		return '%s'
		break
	}
}
`
