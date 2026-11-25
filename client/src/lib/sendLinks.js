// Where an approved message is opened for the person to press Send: Gmail (web), WhatsApp click-to-chat, or the
// recipient's LinkedIn profile (LinkedIn has no pre-filled messages, so the text is copied first).

function queryString(params) {
  return new URLSearchParams(params).toString().replace(/\+/g, '%20');
}

/** Gmail's compose window with the recipient, subject and text filled in. */
export function gmailComposeUrl(item) {
  return `https://mail.google.com/mail/?${queryString({ view: 'cm', fs: '1', to: item.recipient_email, su: item.subject ?? '', body: item.content })}`;
}

export function whatsappUrl(item) {
  const digits = item.recipient_phone.replace(/\D/g, '').replace(/^00/, '');
  return `https://wa.me/${digits}?${queryString({ text: item.content })}`;
}

/** @returns {{ url: string, copy: boolean }} copy = paste the text in the opened page (LinkedIn) */
export function sendTarget(item) {
  if (item.channel === 'email') return { url: gmailComposeUrl(item), copy: false };
  if (item.channel === 'whatsapp') return { url: whatsappUrl(item), copy: false };
  return { url: item.recipient_linkedin, copy: true };
}
