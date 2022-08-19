var express = require('express'),
    async = require('async'),
    path = require('path'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server),
    util = require('util');

var port = process.env.PORT || 8080;

io.set('transports', ['polling']);

io.sockets.on('connection', function (socket) {
    socket.emit('message', { text : 'Welcome!' });
    socket.on('subscribe', function (data) {
    socket.join(data.channel);
    });
});

var which_dbm = process.env.WHICH_DBM;
console.log ("WHICH_DBM=" + which_dbm);

if (which_dbm.includes("POSTGRES")) {
    console.log("Connecting to Postgres");
    var pg = require('pg');
    var { Pool } = require('pg');
    // example environment variable settings
    //   PG_CONNECT_STRING='postgres://admin:admin@postgresql.voting-app-demo-db2.svc.cluster.local/db'
    //   PG_CONNECT_STRING='postgres://admin:admin@postgresql/db'
    var pgconnectstr = process.env.PG_CONNECT_STRING || 'postgresql';
    var pool = new pg.Pool({connectionString: pgconnectstr});

    async.retry(
        {times: 1000, interval: 1000},
        function(callback) {
        pool.connect(function(err, client, done) {
            if (err) {
            console.error("Waiting for db");
            console.log("pg error code:", err.code);
            }
            callback(err, client);
        });
        },
        function(err, client) {
        if (err) {
            return console.error("Giving up");
        }
        console.log("Connected to Postgres database");
        getVotes_pg(client);
        }
    );
} else {
    console.log("Connecting to DB2 database");
    var Pool = require("ibm_db").Pool;
    var pool = new Pool();
    var db2connectstr = util.format('DATABASE=%s;HOSTNAME=%s;PORT=%s;UID=%s;PWD=%s;PROTOCOL=%s',
        process.env.DB2_DATABASE || 'db2sample',
        process.env.DB2_HOSTNAME || 'localhost',
        process.env.DB2_PORT     || '50000',
        process.env.DB2_USER     || 'db2inst1',
        process.env.DB2_PASSWORD || 'passw0rd',
        process.env.DB2_PROTOCOL || 'TCPIP'
    );
    var db2_schema = process.env.DB2_SCHEMA || 'team1'

    async.retry(
        {times: 1000, interval: 1000},
        function(callback) {
            pool.open(db2connectstr, function (err, db) {
                if (err) {
                    console.error("Waiting for db");
                    console.log("db error code:", err);
                }
                callback(err, db);
            });
        },
        function(err, db) {
        if (err) {
            return console.error("Giving up");
        }
        console.log("Connected to DB2 database");
        getVotes_db2(db);
        }
    );
};

function getVotes_pg(client) {
    client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote order by vote', [], function(err, result) {
        if (err) {
          console.error("Error performing query: " + err);
        } else {
          var votes = collectVotesFromResult_pg(result);
          io.sockets.emit("scores", JSON.stringify(votes));
        }
    
        setTimeout(function() {getVotes_pg(client) }, 1000);
      });
}

function collectVotesFromResult_pg(result) {
    var votes = {a: 0, b: 0};

    result.rows.forEach(function (row) {
      votes[row.vote] = parseInt(row.count);
    });
  
    return votes;
}

function getVotes_db2(db) {
    var select_stmt = util.format('SELECT vote, COUNT(id) AS count FROM %s.votes GROUP BY vote order by vote', db2_schema);
    db.query(select_stmt, [], function(err, rows, sqlca) {
      if (err) {
        console.error("Error performing query: " + err + " , SQLCA: " + sqlca);
      } else {
        var votes = collectVotesFromResult_db2(rows);
        io.sockets.emit("scores", JSON.stringify(votes));
      }
  
      setTimeout(function() {getVotes_db2(db) }, 1000);
    });
}

function collectVotesFromResult_db2(rows) {
    var votes = {a: 0, b: 0};

    // console.log(rows);

    rows.forEach(function (row) {
    votes[row.VOTE] = parseInt(row.COUNT);
    });

    return votes;
}

app.use(cookieParser());
app.use(bodyParser());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
    next();
});

app.use(express.static(__dirname + '/views'));

app.get('/', function (req, res) {
    res.sendFile(path.resolve(__dirname + '/views/index.html'));
});

server.timeout = 0;
server.listen(port, function () {
    var port = server.address().port;
    console.log('App running on port ' + port);
    console.log('DB2 connect string ' + db2connectstr);
});
