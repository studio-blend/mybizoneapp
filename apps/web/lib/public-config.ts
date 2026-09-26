// Public contact details are optional until the operator has established them.
// Never substitute an invented address, domain or phone number.
export function getPublicContact() {
  const rawEmail = process.env.SUPPORT_EMAIL?.trim() ?? '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
  const rawPhone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ?? '';
  const phone = /^\+?[1-9]\d{7,14}$/.test(rawPhone) ? rawPhone.replace(/^\+/, '') : null;
  return { email, whatsappUrl: phone ? `https://wa.me/${phone}` : null };
}
