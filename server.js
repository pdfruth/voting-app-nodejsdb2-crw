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

io.set('transports', ['polling']);

io.sockets.on('connection', function (socket) {

  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

async.retry(
    {times: 1000, interval: 1000},
    function(callback) {
        pool.open(db2connectstr, function (err, db) {
            if (err) {
                console.error("Waiting for db");
                console.log("db2 error code:", err);
            }
            callback(err, db);
        });
    },
    function(err, db) {
      if (err) {
        return console.error("Giving up");
      }
      console.log("Connected to db");
      getVotes(db);
    }
);

function getVotes(db) {
  var select_stmt = util.format('SELECT vote, COUNT(id) AS count FROM %s.votes GROUP BY vote order by vote', db2_schema);
  db.query(select_stmt, [], function(err, rows, sqlca) {
    if (err) {
      console.error("Error performing query: " + err + " , SQLCA: " + sqlca);
    } else {
      var votes = collectVotesFromResult(rows);
      io.sockets.emit("scores", JSON.stringify(votes));
    }

    setTimeout(function() {getVotes(db) }, 1000);
  });
}

function collectVotesFromResult(rows) {
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
