build:
	docker build -t botyk .

run:
	docker run -d -p 3000:3000 --name botyk --rm botyk