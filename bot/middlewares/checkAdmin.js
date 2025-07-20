const ADMIN_IDS = [1162246061];

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function checkAdmin(req, res, next) {
  next();
}

module.exports = {
  isAdmin,
  checkAdmin,
};
