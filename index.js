import express from "express";
import pg from "pg";
import axios from "axios";
import bodyParser from "body-parser";
import env from "dotenv";

import bcrypt from 'bcrypt';
import session from "express-session";

const app = new express();
const port = 3000;
env.config();

// connecting to database

const db = new pg.Client({
    user : "postgres",
    host : process.env.HOST,
    database : process.env.DATABASE,
    password : process.env.PASSWORD,
    port : 5432
});
db.connect();

//middlewares

app.use(express.static("public"));

app.use(bodyParser.urlencoded({extended:true}));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false
    }
}));

app.use((req, res, next) => {
    res.locals.userId = req.session.userId;
    res.locals.userName = req.session.userName;
    next();
})

// function

function loginRequired(req, res, next) {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
}

//functions

async function get_all_books(userId){
    try{
        const result = await db.query("SELECT * FROM book WHERE user_id = $1 ORDER BY id ASC;", [userId]);
        return result.rows;
    }catch(error){
        console.log(error);
    }
    
};

// Routes

app.get("/", loginRequired, async (req, res) => {
    try{
        const all_books = await get_all_books(req.session.userId);
        res.render("index.ejs", { books: all_books });
    }catch(error){
        console.log(error);
        res.send("Could not show all books");
    }
});

app.get("/new-book", loginRequired, (req, res) => {
    res.render("new_book.ejs");
});

app.post("/add-book", loginRequired, async (req, res) => {
    try{
        const curr_date = new Date().toISOString().split('T')[0];
        await db.query(
            "INSERT INTO book (title,recommendation,isbn,book_date,description,author, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7);",
            [req.body.title, req.body.recommendation, req.body.isbn, curr_date, req.body.description, req.body.author, req.session.userId]
        );
        res.redirect("/");
    }catch(error){
        console.log(error);
        res.send("Invalid book details! Try Again.");
    }
});

app.get("/note/:id", loginRequired, async (req, res) => {
    const bookId = req.params.id;
    try{
        const result_book = await db.query(
            "SELECT title,author,recommendation,book_date,description FROM book WHERE id = $1 AND user_id = $2;",
            [bookId, req.session.userId]
        );

        if(result_book.rowCount === 0){
            return res.send("Book not found");
        }

        const result_note = await db.query(
            "SELECT id, note_text FROM note WHERE book_id = $1 ORDER BY id ASC",
            [bookId]
        );
        res.render("book_note.ejs", {bookId: bookId, book: result_book.rows[0], notes: result_note.rows});
    }catch(error){
        console.log(error);
        res.send("Could not show notes.");
    }
});

app.get("/delete-book/:id", loginRequired, async (req, res) => {
    const bookId = req.params.id;
    try{
        const result = await db.query(
            "DELETE FROM book WHERE id = $1 AND user_id = $2 returning id;",
            [bookId, req.session.userId]
        );

        if(result.rowCount === 0){
            return res.send("Could not find book to delete");
        }

        res.redirect("/");
    }catch(error){
        console.log(error);
        res.send("Book could not be deleted.");
    }
});

app.post("/add-note/:id", loginRequired, async (req, res) => {
    const bookId = req.params.id;
    try{
        const result = await db.query(
            "INSERT INTO note (note_text, book_id) SELECT $1, id FROM book WHERE id = $2 AND user_id = $3 returning id;",
            [req.body.note_text, bookId, req.session.userId]
        );
        if(result.rowCount === 0){
            return res.send("Could not add note");
        }

        res.redirect(`/note/${bookId}`);
    }catch(error){
        console.log(error);
        res.send("Note could not be added.")
    }
});


app.patch("/edit-note/:id", loginRequired, async (req, res) => {
    const new_note_text = req.body.note_text;
    const noteId = req.params.id;

    try{
        const result = await db.query(
            "UPDATE note SET note_text = $1 WHERE id = $2 AND book_id IN (SELECT id FROM book WHERE user_id = $3) RETURNING id, note_text;",
            [new_note_text, noteId, req.session.userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Note not found." });
        }

        res.status(200).json({ message: "Note updated successfully.", note: result.rows[0] });
    }catch(error){
        console.log(error);
        res.status(500).json({ error: "Could not edit the note." });
    }
});

app.get("/delete-note/:id", loginRequired, async (req, res) => {
    const noteId = req.params.id;
    try{
        const result = await db.query(
            "DELETE FROM note WHERE id = $1 RETURNING book_id;",
            [noteId]
        );    
        res.redirect(`/note/${result.rows[0].book_id}`);
    }catch(error){
        res.send("Could not delete the note.")
    }
});

//authentication related routes

app.get("/signup", (req, res) => {
    const error = req.session.authError;
    delete req.session.authError;
    res.render("signup.ejs", {error});
});

app.post("/signup", async (req, res) => {
    const {name, email, password} = req.body;

    try{
        const hashed_password = await bcrypt.hash(password, 12);
        const result = await db.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) returning id, name;",
            [name, email, hashed_password]
        )
        req.session.userId = result.rows[0].id;
        req.session.userName = result.rows[0].name;

        res.redirect("/");
    }catch(error){
        if (error.code === "23505") {
            req.session.authError = "An account with this email already exists.";
            return res.redirect("/signup");
        }
        console.log(error);
        res.send("Could not sign up the user.");
    }
});

app.get("/login", (req, res) => {
    const error = req.session.authError;
    delete req.session.authError;

    res.render("login.ejs", {error});
});

app.post("/login", async (req, res) => {
    const {email, password} = req.body;

    try{
        const result = await db.query(
            "SELECT * FROM users WHERE email = $1;",
            [email]
        )
        const user = result.rows[0];

        if(!user){
            req.session.authError = "Invalid Email!";
            return res.redirect("/login");
        }

        //check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if(!isMatch){
            req.session.authError = "Wrong Password!";
            return res.redirect("/login");
        }

        req.session.userId = user.id;
        req.session.userName = user.name;

        res.redirect("/");
    }catch(error){
        console.log(error);
        res.send("Could not login the user");
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if(error){
            return res.send("Could not log out");
        }
        res.redirect("/login");
    });
});

app.listen(port, () => {
    console.log(`Server listening at https://localhost:${port}`);
});
