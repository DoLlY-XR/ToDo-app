const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
require('date-utils');

app.use(express.static('public'));
app.use(express.urlencoded({extended: false}));

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'MySQLのパスワード',
  database: 'MySQLの使用するデータベース名'
});

connection.connect((err) => {
  if (err) {
    console.log('error connecting: ' + err.stack);
    return;
  }
  console.log('success');
});

app.use(
  session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  res.locals.url = req.url;
  if (req.session.userId === undefined) {
    res.locals.username = 'ゲスト';
    res.locals.isLoggedIn = false;
    if(req.url === "/list" || req.url === "/trash"){
      res.redirect('/');
    }
  } else {
    res.locals.username = req.session.username;
    res.locals.isLoggedIn = true;
  }
  next();
});

app.get('/', (req, res) => {
  connection.query(
    'SELECT * FROM users',
    (error, results) => {
      res.render('top.ejs');
    }
  );
});

app.get('/signup', (req, res) => {
  res.render('signup.ejs', { errors: [] });
});

app.post('/signup', 
  (req, res, next) => {
    console.log('入力値の空チェック');
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const errors = [];

    if (name === '') {
      errors.push('ユーザー名が空です');
    }

    if (email === '') {
      errors.push('メールアドレスが空です');
    }

    if (password === '') {
      errors.push('パスワードが空です');
    }

    if (errors.length > 0) {
      res.render('signup.ejs', { errors: errors });
    } else {
      next();
    }
  },
  (req, res, next) => {
    console.log('メールアドレスの重複チェック');
    const email = req.body.email;
    const errors = [];
    connection.query(
      'SELECT * FROM users WHERE email = ?',
      [email],
      (error, results) => {
        if (results.length > 0) {
          errors.push('ユーザー登録に失敗しました');
          res.render('signup.ejs', { errors: errors });
        } else {
          next();
        }
      }
    );
  },
  (req, res) => {
    console.log('ユーザー登録');
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    bcrypt.hash(password, 10, (error, hash) => {
      connection.query(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hash],
        (error, results) => {
          console.log(results);
          req.session.userId = results.insertId;
          req.session.username = name;
          res.redirect('/');
        }
      );
    });
  }
);

app.get('/login', (req, res) => {
  res.render('login.ejs');
});

app.post('/login', (req, res) => {
  const email = req.body.email;
  connection.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    (error, results) => {
      if (results.length > 0) {
        const plain = req.body.password;
        
        const hash = results[0].password;
        
        bcrypt.compare(plain, hash, (error, isEqual) => {
          if(isEqual){
            req.session.userId = results[0].id;
            req.session.username = results[0].name;
            res.redirect('/');
          }
          else{
            res.redirect('/login');
          }
        });
      } else {
        res.redirect('/login');
      }
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(error => {
    res.redirect('/');
  });
});

app.get('/list', (req, res) => {
  connection.query(
    'SELECT * FROM list WHERE userId = ? ORDER BY categoryId',
    [req.session.userId],
    (error, results) => {
      res.render('list.ejs', {list: results});
    }
  );
});

app.get('/goal/:id', (req, res) => {
  const today = new Date();
  let goal_date = today.toFormat("YYYY-MM-DD");

  connection.query(
    'SELECT finish_task FROM list WHERE id=?',
    [req.params.id],
    (error, results) => {
      if (results[0].finish_task) {
        goal_date = null;
      }
      
      connection.query(
        'UPDATE list SET finish_task=?, goal_date=? WHERE id=?',
        [!results[0].finish_task, goal_date, req.params.id],
        (error, result) => {
          res.redirect('/list#item' + req.params.id);
        }
      );
    }
  );
});

app.get('/add/:category', (req, res) => {
  connection.query(
    'SELECT categoryId FROM list WHERE category = ? LIMIT 1',
    [req.params.category],
    (error, results) => {
      res.render('add.ejs', {category: req.params.category, list: results, errors: []});
    }
  );
});

app.get('/new/:categoryId', (req, res) => {
  res.render('new.ejs', {categoryId: req.params.categoryId, errors: []});
});

app.post('/create', 
  (req, res, next) => {
    const errors = [];
    const flag = req.body.create;

    if (req.body.category === '') {
      errors.push('カテゴリ名が無記入です');
    }
    if (req.body.task === '') {
      errors.push('タスク名が無記入です');
    }

    if (errors.length > 0) {
      if (flag === "true") {
        res.render('new.ejs', {categoryId: req.body.categoryId, errors: errors});
      }
      else {
        connection.query(
          'SELECT categoryId FROM list WHERE category = ? LIMIT 1',
          [req.body.category],
          (error, results) => {
            res.render('add.ejs', {category: req.body.category, list: results, errors: errors});
          }
        );
      }
    } else {
      next();
    }
  },
  (req, res) => {
    let category = req.body.category;
    let finish_task = false;
    let task = req.body.task;
    let limit_date = req.body.limit_date;
    let today = new Date();
    let start_date = today.toFormat("YYYY-MM-DD");
    let userId = req.session.userId;
    let categoryId = req.body.categoryId;

    if (limit_date === '') {
      limit_date = null;
    }

    console.log("+--------------+");
    console.log("追加する情報");
    console.log(`category = ${category}`);
    console.log(`task = ${task}`);
    console.log(`limit_date = ${limit_date}`);
    console.log(`start_date = ${start_date}`);
    console.log(`userId = ${userId}`);
    console.log(`categoryId = ${categoryId}`);
    console.log("+--------------+");

    connection.query(
      'INSERT INTO list (category, finish_task, task, limit_date, start_date, userId, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [category, finish_task, task, limit_date, start_date, userId, categoryId],
      (error, results) => {
        res.redirect('/list');
      }
    );
  }
);

app.get('/edit/:id', (req, res) => {
  connection.query(
    'SELECT * FROM list WHERE id = ?',
    [req.params.id],
    (error, results) => {
      res.render('edit.ejs', {id: results[0].id, category: results[0].category, task: results[0].task, limit_date: results[0].limit_date, errors: []});
    }
  );
});

app.post('/update/:id', (req, res) => {
  const errors = [];

  if (req.body.limit_date === '') {
    req.body.limit_date = null;
  }
  if (req.body.task === '') {
    errors.push('タスク名が無記入です');
    res.render('edit.ejs', {id: req.body.id, category: req.body.category, task: req.body.task, limit_date: req.body.limit_date, errors: errors });
  }
  else {
    connection.query(
      'UPDATE list SET task=?, limit_date=? WHERE id=?',
      [req.body.task, req.body.limit_date, req.params.id],
      (error, results) => {
        res.redirect('/list');
      }
    );
  }
});

app.post('/move/:id', (req, res) => {
  connection.query(
    'SELECT * FROM list WHERE id = ?',
    [req.params.id],
    (error, results) => {
      connection.query(
        'INSERT INTO trash (id, category, finish_task, task, limit_date, start_date, goal_date, userId, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [results[0].id, results[0].category, results[0].finish_task, results[0].task, results[0].limit_date, results[0].start_date, results[0].goal_date, results[0].userId, results[0].categoryId],
        (error, results) => {
          connection.query(
            'DELETE FROM list WHERE id = ?',
            [req.params.id],
            (error, results) => {
              res.redirect('/list#item' + req.body.itemId);
            }
          );
        }
      );
    }
  );
});

app.post('/remove/:categoryId', (req, res) => {
  connection.query(
    'SELECT * FROM list WHERE userId = ? AND categoryId = ?',
    [req.session.userId, req.params.categoryId],
    (error, results) => {
      results.forEach((result) => {
        connection.query(
          'INSERT INTO trash (id, category, finish_task, task, limit_date, start_date, goal_date, userId, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [result.id, result.category, result.finish_task, result.task, result.limit_date, result.start_date, result.goal_date, result.userId, result.categoryId],
          (error, results) => {
          }
        );
        connection.query(
          'DELETE FROM list WHERE id = ?',
          [result.id],
          (error, results) => {
          }
        );
      })
      res.redirect('/list');
    }
  );
});

app.get('/trash', (req, res) => {
  connection.query(
    'SELECT * FROM trash WHERE userId = ? ORDER BY categoryId',
    [req.session.userId],
    (error, results) => {
      res.render('trash.ejs', {trash: results});
    }
  );
});

app.get('/return/:id', (req, res) => {
  connection.query(
    'SELECT * FROM trash WHERE id = ?',
    [req.params.id],
    (error, results) => {
      connection.query(
        'INSERT INTO list (id, category, finish_task, task, limit_date, start_date, goal_date, userId, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [results[0].id, results[0].category, results[0].finish_task, results[0].task, results[0].limit_date, results[0].start_date, results[0].goal_date, results[0].userId, results[0].categoryId],
        (error, results) => {
          connection.query(
            'DELETE FROM trash WHERE id = ?',
            [req.params.id],
            (error, results) => {
              res.redirect('/trash#item' + req.body.itemId);
            }
          );
        }
      );
    }
  );
});

app.post('/delete/:id', (req, res) => {
  connection.query(
    'DELETE FROM trash WHERE id = ?',
    [req.params.id],
    (error, results) => {
      res.redirect('/trash#item' + req.body.itemId);
    }
  );
});

app.get('/restore/:categoryId', (req, res) => {
  connection.query(
    'SELECT * FROM trash WHERE userId = ? AND categoryId = ?',
    [req.session.userId, req.params.categoryId],
    (error, results) => {
      results.forEach((result) => {
        connection.query(
          'INSERT INTO list (id, category, finish_task, task, limit_date, start_date, goal_date, userId, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [result.id, result.category, result.finish_task, result.task, result.limit_date, result.start_date, result.goal_date, result.userId, result.categoryId],
          (error, results) => {
          }
        );
        connection.query(
          'DELETE FROM trash WHERE id = ?',
          [result.id],
          (error, results) => {
          }
        );
      })
      res.redirect('/trash');
    }
  );
});

app.post('/erasure/:categoryId', (req, res) => {
  connection.query(
    'SELECT * FROM trash WHERE userId = ? AND categoryId = ?',
    [req.session.userId, req.params.categoryId],
    (error, results) => {
      results.forEach((result) => {
        connection.query(
          'DELETE FROM trash WHERE id = ?',
          [result.id],
          (error, results) => {
          }
        );
      })
      res.redirect('/trash');
    }
  );
});

app.listen(3000);