'use client';

import { Button } from '@mybizone/ui/button';
import { Textarea } from '@mybizone/ui/textarea';
import { useState, useTransition } from 'react';
import { addCustomerNoteAction } from '../actions';

interface NoteItem {
  id: string;
  note: string;
  createdAt: Date | null;
  createdBy: string | null;
}

export function CustomerNotesSection({
  customerId,
  initialNotes,
}: {
  customerId: string;
  initialNotes: NoteItem[];
}) {
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();

  function saveNote() {
    const trimmed = text.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await addCustomerNoteAction({ customerId, note: trimmed });
      if (res.ok) {
        setNotes((prev) => [
          { id: crypto.randomUUID(), note: trimmed, createdAt: new Date(), createdBy: null },
          ...prev,
        ]);
        setText('');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.createdAt
                  ? new Date(n.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          maxLength={2000}
          className="resize-none text-sm"
        />
        <Button
          size="sm"
          onClick={saveNote}
          disabled={!text.trim() || isPending}
        >
          {isPending ? 'Saving...' : 'Save note'}
        </Button>
      </div>
    </div>
  );
}
