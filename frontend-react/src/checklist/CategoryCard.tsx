import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { ChecklistItem } from './checklistReducer';
import type { Member } from './useChecklist';
import { ItemRow } from './ItemRow';

interface CategoryCardProps {
  category: string;
  items: ChecklistItem[];
  members: Member[];
  viewerId: string | undefined;
  onToggle: (itemId: string) => void;
  onAssign: (itemId: string, userId: string | null) => void;
  onRemove: (itemId: string) => void;
  onSetAllPacked: (itemIds: string[], packed: boolean) => void;
  onAdd: (name: string, category: string) => Promise<boolean>;
}

export function CategoryCard({
  category,
  items,
  members,
  viewerId,
  onToggle,
  onAssign,
  onRemove,
  onSetAllPacked,
  onAdd,
}: CategoryCardProps) {
  const packed = items.filter((i) => i.packed).length;
  const allPacked = items.length > 0 && packed === items.length;
  const somePacked = packed > 0 && !allPacked;
  const headingId = `cat-${category.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  // `indeterminate` has no HTML attribute — it can only be set from script.
  // A part-packed category is neither checked nor unchecked, and saying so is
  // what tells the user the header box will pack the rest rather than clear it.
  const allBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = somePacked;
  }, [somePacked]);

  return (
    <section className="category" aria-labelledby={headingId}>
      <header className="category__head">
        <h2 className="category__title" id={headingId}>
          {category}
        </h2>
        <span className="category__count">
          {packed}/{items.length}
        </span>
        {items.length > 0 ? (
          <label className="category__all">
            <input
              ref={allBox}
              type="checkbox"
              checked={allPacked}
              // Same rule as the vanilla header box: anything unpacked means
              // "pack them all"; a fully packed category means "unpack them all".
              onChange={() =>
                onSetAllPacked(
                  items.map((i) => i.itemId),
                  !allPacked,
                )
              }
              aria-label={allPacked ? `Unpack all ${category}` : `Pack all ${category}`}
            />
            <span aria-hidden="true">All</span>
          </label>
        ) : null}
      </header>

      {items.length > 0 ? (
        <ul className="items">
          {items.map((item) => (
            <ItemRow
              key={item.itemId}
              item={item}
              members={members}
              viewerId={viewerId}
              onToggle={onToggle}
              onAssign={onAssign}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : null}

      <AddItem category={category} onAdd={onAdd} />
    </section>
  );
}

/**
 * The dashed "Add item" pill, which opens into a one-line form.
 *
 * Stays open after a successful add, with the field cleared and focused, so a
 * list can be typed in one go — packing lists are entered in bursts, and
 * reopening the form for every line is the friction that makes people stop.
 */
function AddItem({
  category,
  onAdd,
}: {
  category: string;
  onAdd: (name: string, category: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    // Clear immediately rather than after the request: the row appears
    // optimistically, so waiting would show the text twice. If the add fails,
    // the error banner names the item, and the text is put back to retry.
    setName('');
    input.current?.focus();
    const ok = await onAdd(value, category);
    if (!ok) setName(value);
  }

  if (!open) {
    return (
      <div className="add-item">
        <button type="button" className="add-item__open" onClick={() => setOpen(true)}>
          + Add item to {category}
        </button>
      </div>
    );
  }

  return (
    <div className="add-item">
      <form className="add-item__form" onSubmit={handleSubmit}>
        <input
          ref={input}
          className="add-item__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setName('');
              setOpen(false);
            }
          }}
          placeholder={`Add to ${category}…`}
          aria-label={`New item in ${category}`}
          maxLength={120}
        />
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
          Add
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setName('');
            setOpen(false);
          }}
        >
          Done
        </button>
      </form>
    </div>
  );
}
