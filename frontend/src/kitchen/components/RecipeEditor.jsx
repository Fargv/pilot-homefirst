import React, { useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

function ToolbarButton({ onClick, isActive, title, children }) {
  return (
    <button
      type="button"
      className={`recipe-toolbar-btn${isActive ? " is-active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }) {
  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL del enlace:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL de la imagen:", "https://");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="recipe-toolbar">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Negrita"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Cursiva"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Subrayado"
      >
        <span style={{ textDecoration: "underline" }}>U</span>
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Encabezado H2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Encabezado H3"
      >
        H3
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Lista con viñetas"
      >
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="3" cy="5" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="5" x2="16" y2="5" />
          <circle cx="3" cy="9" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="9" x2="16" y2="9" />
          <circle cx="3" cy="13" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="13" x2="16" y2="13" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <text x="1" y="7" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">1.</text>
          <line x1="7" y1="5" x2="16" y2="5" />
          <text x="1" y="11" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">2.</text>
          <line x1="7" y1="9" x2="16" y2="9" />
          <text x="1" y="15" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">3.</text>
          <line x1="7" y1="13" x2="16" y2="13" />
        </svg>
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <ToolbarButton
        onClick={setLink}
        isActive={editor.isActive("link")}
        title="Insertar enlace"
      >
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M7.5 10.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L8 5" />
          <path d="M10.5 7.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L10 13" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={insertImage}
        isActive={false}
        title="Insertar imagen"
      >
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <rect x="2" y="3" width="14" height="12" rx="2" />
          <circle cx="6.5" cy="7" r="1.5" />
          <path d="M2 13l4-4 3 3 2-2 5 5" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

export default function RecipeEditor({
  recipeIngredients = [],
  recipeSteps = null,
  recipeServings = null,
  dishIngredientNames = [],
  onAddIngredientToDish,
  onChange,
  readOnly = false
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: "Describe los pasos de elaboración..." }),
      TextStyle,
      Color
    ],
    content: recipeSteps || "",
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (!onChange) return;
      onChange((prev) => ({ ...prev, steps: ed.getJSON() }));
    }
  });

  const addIngredient = () => {
    if (!onChange) return;
    onChange((prev) => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), { name: "", quantity: "" }]
    }));
  };

  const removeIngredient = (index) => {
    if (!onChange) return;
    onChange((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((_, i) => i !== index)
    }));
  };

  const updateIngredient = (index, field, value) => {
    if (!onChange) return;
    onChange((prev) => {
      const next = [...(prev.ingredients || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, ingredients: next };
    });
  };

  const isNewIngredient = (name) => {
    if (!name || !dishIngredientNames.length) return false;
    return !dishIngredientNames.includes(String(name).toLowerCase().trim());
  };

  if (readOnly) {
    return (
      <div className="recipe-editor-section">
        {recipeServings ? (
          <p className="recipe-servings-label">Para {recipeServings} {recipeServings === 1 ? "persona" : "personas"}</p>
        ) : null}
        {recipeIngredients && recipeIngredients.length > 0 ? (
          <div>
            <p className="recipe-section-title">Ingredientes</p>
            <table className="recipe-ingredients-table">
              <tbody>
                {recipeIngredients.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {recipeSteps ? (
          <div>
            <p className="recipe-section-title">Elaboración</p>
            <div className="recipe-viewer-wrap">
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : null}
        {(!recipeIngredients || recipeIngredients.length === 0) && !recipeSteps ? (
          <p className="kitchen-muted">Este plato no tiene receta todavía.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="recipe-editor-section">
      <div className="recipe-servings-row">
        <label className="recipe-section-title" htmlFor="recipe-servings">Para</label>
        <input
          id="recipe-servings"
          type="number"
          min="1"
          max="99"
          className="recipe-servings-input"
          placeholder="—"
          value={recipeServings ?? ""}
          onChange={(e) => {
            if (!onChange) return;
            const val = e.target.value === "" ? null : Number(e.target.value);
            onChange((prev) => ({ ...prev, servings: val }));
          }}
        />
        <span className="recipe-section-title">personas</span>
      </div>
      <div>
        <p className="recipe-section-title">Ingredientes</p>
        <div className="recipe-ingredient-list">
          {(recipeIngredients || []).map((item, idx) => (
            <div key={idx} className="recipe-ingredient-row">
              <input
                className="recipe-ingredient-input"
                placeholder="Ingrediente"
                value={item.name || ""}
                onChange={(e) => updateIngredient(idx, "name", e.target.value)}
              />
              <input
                className="recipe-ingredient-input recipe-ingredient-qty"
                placeholder="Cantidad"
                value={item.quantity || ""}
                onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
              />
              {isNewIngredient(item.name) && onAddIngredientToDish ? (
                <button
                  type="button"
                  className="recipe-add-to-dish-btn"
                  title="Añadir al plato (lista de la compra)"
                  onClick={() => onAddIngredientToDish(item.name)}
                >
                  🛒
                </button>
              ) : null}
              <button
                type="button"
                className="recipe-remove-btn"
                onClick={() => removeIngredient(idx)}
                aria-label="Eliminar ingrediente"
                title="Eliminar"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="recipe-add-ingredient-btn"
          onClick={addIngredient}
        >
          + Añadir ingrediente
        </button>
      </div>
      <div>
        <p className="recipe-section-title">Elaboración</p>
        <Toolbar editor={editor} />
        <div className="recipe-editor-wrap">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
