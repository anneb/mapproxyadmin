import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import "./mapproxy-config.js";
import "./mapproxy-getcaps.js";
import "./mp-accordion.js";
/**
* @polymer
* @extends HTMLElement
*/

class MapproxyNew extends LitElement {
  static get properties() {
    return {
      config: {
        type: Object
      },
      open: {
        type: Boolean
      },
      list: {
        type: Array
      }
    };
  }

  static get styles() {
    return css`
            :host {
                display: block;
            }
            .panel {
                margin-left: 20px;
            }
        `;
  }

  constructor() {
    super();
    this.config = {};
    this.open = false;
  }

  render() {
    return html`
            <mp-accordion @click="${e => this.toggleOpen(e)}">New mapproxy config...</mp-accordion>
            <div class="panel">
            ${this.mapproxyNewForm()}
            </div>
            `;
  }

  mapproxyNewForm() {
    if (!this.open) {
      return html``;
    }

    return html`
            <mapproxy-config .config="${this.config}"></mapproxy-config>
            <mapproxy-getcaps .list="${this.list}"></mapproxy-getcaps>
            `;
  }

  toggleOpen(e) {
    this.open = !this.open;
  }

}

window.customElements.define('mapproxy-new', MapproxyNew);