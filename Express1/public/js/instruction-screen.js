import { setupFooterNavigation, backButtonClickHandler } from "./utils.js";

backButtonClickHandler('index.html');

document.addEventListener('DOMContentLoaded', () => {
  setupFooterNavigation('instruction');
});
