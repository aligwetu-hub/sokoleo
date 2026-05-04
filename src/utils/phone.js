function normalizePhone(rawPhone) {
  if (!rawPhone) {
    return '';
  }

  return String(rawPhone).replace(/\s+/g, '').replace(/^\+/, '');
}

function isValidKenyaPhone(phone) {
  return /^(254|0)7\d{8}$/.test(phone);
}

module.exports = {
  normalizePhone,
  isValidKenyaPhone
};
