
var bodyParser = require("body-parser")

var fs = require("fs")

const OktaJwtVerifier = require('@okta/jwt-verifier')

var request = require("request")

var session = require("express-session")

//*******************************************/

const oktaJwtVerifier = new OktaJwtVerifier({
	issuer: process.env.ISSUER
})

module.exports = function (app) {

	app.get('/', function(req, res, next) {

		fs.readFile('./html/index.html', 'utf8', (error, page) => {

			evaluate_vars(page, (error, page) => {
				if (error) { throw new Error(error) }

				res.send(page)

			})
		})
	})

	app.post('/endSession', function(req, res, next) {

		delete req.session.access_token

		res.send("removed access token from server-side session");
	})

	app.post('/getAccessToken', function(req, res, next) {
		var code = req.body.code;

		console.log("the authorization code is: " + code);

		// exchange the authorization code
		// for an access token

		var options = {
			method: 'POST',
			url: process.env.ISSUER + "/v1/token",
			qs: {
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: process.env.REDIRECT_URI
			},
			headers: {
				'cache-control': 'no-cache',
				authorization: 'Basic ' + getBasicAuthString(),
				'content-type': 'application/x-www-form-urlencoded'
			}
		}

		request(options, function (error, response, body) {
			if (error) throw new Error(error);

			console.log(body);

			var obj = JSON.parse(body);

			if (obj.hasOwnProperty("access_token")) {
				req.session.access_token = obj.access_token;
				console.log("the access token is: " + req.session.access_token);
			}
			if (obj.hasOwnProperty("id_token")) {
				req.session.id_token = obj.id_token;
			}

			var response_to_browser = {}

			response_to_browser.access_token = obj.access_token
			response_to_browser.id_token = obj.id_token

			oktaJwtVerifier.verifyAccessToken(obj.id_token, process.env.CLIENT_ID)
			.then(jwt => {
				response_to_browser.id_token_decoded = jwt.claims
				console.log(jwt.claims)

				oktaJwtVerifier.verifyAccessToken(obj.access_token, process.env.AUD)
				.then(jwt => {
					response_to_browser.access_token_decoded = jwt.claims

					console.log(jwt.claims)

					console.log("the response to the browser is: ")
					console.dir(response_to_browser)

					res.json(JSON.stringify(response_to_browser))
				})
				.catch(err => {
					console.log("something went wrong with the access_token validation")
					console.log(err)

				})
			})
			.catch(err => {
				console.log("something went wrong with the id_token validation")
				console.log(err)
			})
		})
	})

	app.post('/authorized', function(req, res, next) {
		var basiccode = req.body.basiccode;
		console.log("the authorization code is: " + basiccode);
		console.log("the scope is: " + req.body.scope);
		//client creds todo
		var options = {
			method: 'POST',
			url: process.env.ISSUER + "/v1/token",
			qs: {grant_type:'client_credentials', scope: req.body.scope},
			headers: {
				'cache-control': 'no-cache',
				'authorization': 'Basic ' + basiccode,
				'content-type': 'application/x-www-form-urlencoded'
			}
		}

		request(options, function (error, response, body) {
			if (error) throw new Error(error);

			console.log(body);

			var obj = JSON.parse(body);

			if (obj.hasOwnProperty("access_token")) {
				req.session.access_token = obj.access_token;
				console.log("the access token is: " + req.session.access_token);
			}
		
			var response_to_browser = {}

			response_to_browser.access_token = obj.access_token

			oktaJwtVerifier.verifyAccessToken(obj.access_token, process.env.AUD)
			.then(jwt => {
				response_to_browser.access_token_decoded = jwt.claims

				console.log(jwt.claims)

				console.log("the response to the browser is: ")
				console.dir(response_to_browser)

				res.json(JSON.stringify(response_to_browser))
			})
			.catch(err => {
				console.log("something went wrong with the access_token validation")
				console.log(err)
				res.json({"issue":"something went wrong with the access_token validation"})
			})
		})
	})
	
	app.post('/getData', function(req, res, next) {
		var endpoint = req.body.endpoint;

		console.log("the requested endpoint is: " + endpoint);

		console.log("the access_token token is: \n" + req.session.access_token + "\n");

		// send the access token to the requested API endpoint

		if (process.env.hasOwnProperty("GATEWAY_URI") && process.env.GATEWAY_URI != "") {

			var url = process.env.GATEWAY_URI + "/" + req.body.endpoint

			console.log("sending request to: " + url)

			var options = {
				method: 'GET',
				url: url,
				headers: {
					'cache-control': 'no-cache',
					authorization: "Bearer " + req.session.access_token,

					accept: 'application/json',
					'content-type': 'application/x-www-form-urlencoded'
				}
			}

			request(options, function (error, response, body) {
				if (error) throw new Error(error)

				console.log("******\nresponse from API gateway: ")
				console.log("the status code is: " + response.statusCode)

				console.log("the body is:")
				console.log(body)

				if (response.statusCode == 403) {
					res.json({message: 'forbidden'})
					console.log("the request is forbidden")
				}
				else if (response.statusCode == 401) {
					res.json({ message: 'unauthorized' })
					console.log("the request is unauthorized")
				}
				// Add ec here for 504
				else {
					res.json(body)
				}
			})
		}
		else {
			res.json({message: 'gateway_uri not yet defined.'})
		}
	})

	function getBasicAuthString() {

		var x = process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET

		var y = new Buffer(x).toString('base64')

		return y
	}
}

function evaluate_vars(page, callback) {
	var regex
	for (var key in process.env) {
		regex = new RegExp('{{' + key + '}}', 'g')

		page = page.replace(regex, process.env[key])
	}
	return callback(null, page)
}