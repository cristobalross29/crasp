export default class Table {
  constructor() {
    this.rows = [];
  }

  push(...rows) {
    this.rows.push(...rows);
  }

  toString() {
    return "";
  }
}
