.PHONY: dev
dev:
	BROWSER=none npx netlify dev


.PHONY: env-apply
env-apply:
	npx netlify env:import .env
	npx netlify env:set NODE_ENV production
