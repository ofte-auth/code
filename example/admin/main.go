package main

import (
	"io/ioutil"
	"os"

	"github.com/fraugster/cli"
	"github.com/pkg/errors"
	"ofte.io/services/admin/config"
	"ofte.io/services/admin/service"
	"ofte.io/services/lib/log"
)

const (
	minKeySize = 128
)

func main() {

	cfg, err := config.Read(os.Getenv("CONFIG_SOURCE"))
	if err != nil {
		// Panic because the logger is not initialized yet
		panic(err.Error())
	}

	logger := log.New(cfg.ServiceName)

	// check, load symmetric key
	key, err := loadKey(cfg.SymmetricKeyFile)
	if err != nil {
		logger.Fatal("Error loading symmetric key file", log.Err(err))
	}

	instance := service.New(cfg, logger, key)

	//blocking call
	if err := instance.Run(cli.Context()); err != nil {
		logger.Error("Error running instance", log.Err(err))
	}
}

func loadKey(filename string) ([]byte, error) {
	/*
		info, err := os.Stat(filename)
		if err != nil {
			return nil, errors.Wrap(err, "reading symmetric key file")
		}
			if info.Mode()&(1<<2) != 0 {
				return nil, errors.New("invalid permissions on key file")
			}
	*/
	key, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, errors.Wrap(err, "reading symmetric key file")
	}
	if len(key)*8 < minKeySize {
		return nil, errors.Errorf("insufficient length of key in symmetric private key file %s", filename)
	}
	return key, nil
}
