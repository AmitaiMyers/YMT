// Renders generated letters/documents. Each line resolves its own direction (dir="auto"), so an English
// line inside a Hebrew document keeps its punctuation in place, while alignment follows the document.

export function GeneratedText({ text, language, className = '' }) {
  const documentDir = language === 'he' ? 'rtl' : 'ltr';
  return (
    <div lang={language} dir={documentDir} className={`generated-text reading text-[15px] text-fg ${className}`}>
      {text.split('\n').map((line, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <p key={index} dir="auto" className={documentDir === 'rtl' ? 'text-right' : 'text-left'}>{line}</p>
      ))}
    </div>
  );
}
