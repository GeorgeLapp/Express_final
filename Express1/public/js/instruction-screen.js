import { setupFooterNavigation, backButtonClickHandler } from "./utils2.js";

backButtonClickHandler('index.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation('instruction');
});
