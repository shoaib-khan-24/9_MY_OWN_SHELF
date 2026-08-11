const editDialog = document.querySelector(".edit-note-dialog");
const editNoteForm = document.querySelector(".edit-note-form");
const editNoteTextarea = document.querySelector("#edit-note-text");
let activeNoteId;

document.querySelectorAll("[data-edit-note-id]").forEach((button) => {
    button.addEventListener("click", () => {
        activeNoteId = button.dataset.editNoteId;
        editNoteTextarea.value = button.dataset.editNoteText;
        editDialog.showModal();
        editNoteTextarea.focus();
    });
});

document.querySelector(".dialog-close")?.addEventListener("click", () => {
    editDialog.close();
});

editNoteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = editNoteForm.querySelector(".form-message");
    const submitButton = editNoteForm.querySelector("button[type='submit']");
    const noteText = editNoteTextarea.value.trim();

    if (!activeNoteId || !noteText) return;

    submitButton.disabled = true;
    message.textContent = "Saving…";

    try {
        const response = await fetch(`/edit-note/${activeNoteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ note_text: noteText })
        });

        if (!response.ok) throw new Error("Request failed");
        window.location.reload();
    } catch {
        submitButton.disabled = false;
        message.textContent = "Could not update the note.";
    }
});
