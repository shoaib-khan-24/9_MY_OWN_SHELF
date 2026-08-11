import express from "express";
import pg from "pg";
import axios from "axios";
import bodyParser from "body-parser";
import env from "dotenv";

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

//functions

async function get_all_books(){
    try{
        const result = await db.query("SELECT * FROM book ORDER BY id ASC;");
        return result.rows;
    }catch(error){
        console.log(error);
    }
    
};

// Routes

app.get("/", async (req, res) => {
    try{
        const all_books = await get_all_books();
        res.render("index.ejs", { books: all_books });
    }catch(error){
        console.log(error);
        res.send("Could not show all books");
    }
});

app.get("/new-book", (req, res) => {
    res.render("new_book.ejs");
});

app.post("/add-book", async (req, res) => {
    try{
        const curr_date = new Date().toISOString().split('T')[0];
        await db.query(
            "INSERT INTO book (title,recommendation,isbn,book_date,description,author) VALUES ($1,$2,$3,$4,$5,$6);",
            [req.body.title, req.body.recommendation, req.body.isbn, curr_date, req.body.description, req.body.author]
        );
        res.redirect("/");
    }catch(error){
        console.log(error);
        res.send("Invalid book details! Try Again.");
    }
});

app.get("/note/:id", async (req, res) => {
    const bookId = req.params.id;
    try{
        const result_book = await db.query(
            "SELECT title,author,recommendation,book_date,description FROM book WHERE id = $1;",
            [bookId]
        );

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

app.get("/delete-book/:id", async (req, res) => {
    const bookId = req.params.id;
    try{
        await db.query(
            "DELETE FROM book WHERE id = $1;",
            [bookId]
        );
        res.redirect("/");
    }catch(error){
        console.log(error);
        res.send("Book could not be deleted.");
    }
});

app.post("/add-note/:id", async (req, res) => {
    const bookId = req.params.id;
    try{
        await db.query(
            "INSERT INTO note (note_text, book_id) VALUES ($1, $2);",
            [req.body.note_text, bookId]
        );
        res.redirect(`/note/${bookId}`);
    }catch(error){
        console.log(error);
        res.send("Note could not be added.")
    }
});


app.patch("/edit-note/:id", async (req, res) => {
    const new_note_text = req.body.note_text;
    const noteId = req.params.id;

    try{
        const result = await db.query(
            "UPDATE note SET note_text = $1 WHERE id = $2 RETURNING id, note_text;",
            [new_note_text, noteId]
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

app.get("/delete-note/:id", async (req, res) => {
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

app.listen(port, () => {
    console.log(`Server listening at https://localhost:${port}`);
});
