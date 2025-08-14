import { LitElement, html, nothing } from "da-lit";
import getStyle from "https://da.live/nx/utils/styles.js";

const sheet = await getStyle(import.meta.url);

export default class DaTitle extends LitElement {
  static properties = {
    details: { type: Object },
    _actionsVis: {},
    _status: { state: true },
    _fixedActions: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  firstUpdated() {
    const observer = new IntersectionObserver((entries) => {
      this._fixedActions = !entries[0].isIntersecting;
    });

    const element = this.shadowRoot.querySelector("h1");
    if (element) observer.observe(element);
  }

  handleError(json, action, icon) {
    this._status = { ...json.error, action };
    icon.classList.remove("is-sending");
    icon.parentElement.classList.add("is-error");
  }

  async handleAction(action) {
    this.toggleActions();
    this._status = null;
    const sendBtn = this.shadowRoot.querySelector(".da-title-action-send-icon");

    if (action === "preview" || action === "publish") {
      let myEvent = new CustomEvent("editor-preview-publish", {
        detail: { action, location: sendBtn },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(myEvent);
    }
  }

  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  render() {
    return html`
      <div class="da-title-inner">
        <div class="da-title-name">
          <a
            href="/#${this.details.parent}"
            target="${this.details.parent}"
            class="da-title-name-label"
            >${this.details.parentName}</a
          >
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-collab-actions-wrapper">
          <div
            class="da-title-actions ${this._fixedActions
              ? "is-fixed"
              : ""} ${this._actionsVis ? "is-open" : ""}"
          >
            <button
              @click=${() => this.handleAction("preview")}
              class="con-button blue da-title-action"
              aria-label="Send"
            >
              Preview
            </button>
            <button
              @click=${() => this.handleAction("publish")}
              class="con-button blue da-title-action"
              aria-label="Send"
            >
              Publish
            </button>
            <button
              @click=${this.toggleActions}
              class="con-button blue da-title-action-send"
              aria-label="Send"
            >
              <span class="da-title-action-send-icon"></span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("da-title", DaTitle);
