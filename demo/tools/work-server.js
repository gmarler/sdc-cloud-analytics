/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * work-server.js: simple HTTP server that can artificially delay requests with
 *     /slow in the URI.  Also generates garbage to exercise GC.
 */

var port = process.argv[2] || '80';
var http = require('http');
http.createServer(handle).listen(port);
console.log('Server running at http://127.0.0.1:%s/', port);

function handle(request, response)
{
	if (request.url.indexOf('slow') != -1) {
		setTimeout(finish(request, response), 50);
		return;
	}

	finish(request, response)();
}

function finish(request, response)
{
	return (function () {
		if (request.url.indexOf('garbage') != -1)
			make_garbage();
		response.writeHead(200, {'Content-Type': 'text/plain'});
		response.end();
	});
}

var a = {};

function make_garbage()
{
	var ii;
	for (ii = 0; ii < 5; ii++) {
		var arr = [];
		var size = Math.floor(Math.random() * 10000);
		
		for (i = 0; i < size; i++)
			arr.push(Math.random());
		
		field = Math.floor(Math.random() * 100);
		a[field] = arr;
	}
}
