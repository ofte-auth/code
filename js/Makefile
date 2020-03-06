lint:
	eslint ofte.js

minimize:
	uglifyjs --compress -- ofte.js > ofte.min.js

deploy: lint minimize
	scp ofte.js ofte.min.js cdn:/var/www/js/code/js/

.PHONY: lint minimize deploy