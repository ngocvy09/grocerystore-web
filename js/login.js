'use strict';

// which page each role goes to
const PAGES = { Customer: 'customer.html', Manager: 'manager.html', Deliveryman: 'deliveryman.html' };

const loginForm = $('#login-form');
const registerForm = $('#register-form');

// show one form and hide the other
function show(which) {
  loginForm.classList.toggle('hidden', which !== 'login');
  registerForm.classList.toggle('hidden', which !== 'register');
  $('#subtitle').textContent = which === 'login' ? 'Log in to continue' : 'Create a customer account';
  $('#l-error').textContent = '';
  $('#r-error').textContent = '';
}
$('#to-register').onclick = () => { show('register'); $('#r-name').focus(); };
$('#to-login').onclick = () => { show('login'); $('#l-user').focus(); };

// ---------- LOG IN ----------
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('#l-user').value.trim();
  const password = $('#l-pass').value;

  if (!username || !password) {
    $('#l-error').textContent = 'Please enter username and password.';
    return;
  }
  const user = await DAO.UserDAO.authenticate(username, password);
  if (!user) {
    $('#l-error').textContent = 'Wrong username or password.';
    return;
  }
  setSession(user);
    location.href = PAGES[user.role];
});

// ---------- REGISTER ----------
registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#r-error');
  const name = $('#r-name').value.trim();
  const phone = $('#r-phone').value.trim();
  const address = $('#r-address').value.trim();
  const username = $('#r-user').value.trim();
  const pass = $('#r-pass').value;
  const confirm = $('#r-confirm').value;

  if (!name || !phone || !address || !username || !pass || !confirm) {
    err.textContent = 'Please fill in every field.'; return;
  }
  if (!/^\d{9,11}$/.test(phone)) {
    err.textContent = 'Phone must be 9-11 digits.'; return;
  }
  if (pass.length < 4) {
    err.textContent = 'Password must have at least 4 characters.'; return;
  }
  if (pass !== confirm) {
    err.textContent = 'Passwords do not match.'; return;
  }
  try {
    await DAO.UserDAO.insert({ username, password: pass, name, phone, address });
  } catch (ex) {
    err.textContent = ex.message;      // e.g. "That username is already taken."
    return;
  }
  show('login');
  $('#l-user').value = username;
  $('#l-pass').value = '';
  $('#l-error').innerHTML = '<span class="success-text">Account created. Please log in.</span>';
  $('#l-pass').focus();
});