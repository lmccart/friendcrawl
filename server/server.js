
var express = require('express');
var app = express();
app.set('port', process.env.PORT || 3000);
app.use(express.static(__dirname + '/viewer'));

var server = require('http').Server(app);
server.listen(app.get('port'));
console.log('Listening on '+app.get('port'));

var moment = require('moment-timezone');
moment.tz.setDefault('America/New_York');
var month = '2015-08-';
var next_time;
var end_time;
var cur_session;

var fake_time = moment(month+'20 08:55');

// scheduling
var cron = require('cron');
var cronJob = cron.job("0 */5 * * * *", function(){
  updateCurrent();
}); 

// db stuff
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var sessions;

MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
  assert.equal(err, null);
  console.log("Connected correctly to db");
  sessions = db.collection('sessions');

  // init
  sessions.find({meta:true}).toArray(function(err, arr) {
    assert.equal(err, null);
    if (arr.length == 0) {
      resetMeta(start);
    } else {
      next_time = moment(arr[0].next_time);
      start();
    }
  });
});


// // Routes
app.get('/insert', function (req, res) {
  if (process.env.SERVER_PASS === req.query.pass) {
    var uri = req.query.uri;
    var name = req.query.name;
    var t = next_time.format();

    insertSession(t, uri, name);
    updateInsertTime();

    res.send('set u:'+uri+' n:'+name+' t:'+t);
  } else {
    res.send('permission denied: thanks for trying');
  }
});

app.get('/get_next_insert', function(req, res) {
  res.json({next: next_time.format()});
});

app.get('/get_current', function(req, res) {
  if (cur_session) {
    res.json({uri: cur_session.uri, name: cur_session.name, offset: 5}); // pend
  } else {
    res.json({cur_session: false});
  }
});

app.get('/reset_meta', function(req, res) {
  resetMeta(function(m) {
    res.json(m);
  });
});

function start() {
  end_time = moment(month+next_time.get('date')+' 19:30');
  updateCurrent();
  cronJob.start();
}

function resetMeta(cb) {
  console.log('reset meta');
  next_time = moment(month+'20 09:00');
  var m = { meta:true, next_time: next_time.format() };
  sessions.insert(m, function(err, result) {
    if (cb) cb(m);
  });
}

function insertSession(t, u, n) {
  sessions.insert({ time:t, uri:u, name:n}, function(err, result) {
    assert.equal(err, null);
    console.log("inserted");
  });
}

function updateCurrent() {
  var last;
  if (fake_time) { // for testing
    last = fake_time.add(5, 'minutes');
  }
  last.minute(5 * Math.floor( fake_time.get('minute') / 5 ));
  last.second(0);
  last.millisecond(0);

  sessions.find({time: last.format()}).toArray(function(err, arr) {
    assert.equal(err, null);
    if (arr.length > 0) {
      cur_session = arr[0];
    } else {
      console.log('session not found for time '+last.format());
      cur_session = null;
    }
  });
}

function updateInsertTime() {  
  next_time = next_time.add(5, 'm');
  if (!next_time.isBefore(end_time)) {
    next_time = moment(month+(next_time.get('date')+1)+' 09:00');
    end_time = moment(month+next_time.get('date')+' 19:30');
  }

  sessions.update({meta:true}, {$set: {next_time:next_time.format()}}, function(err, res) {
    if (err) console.log(err);
  });
}
