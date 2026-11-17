/*
  Large libraries used only by spreadsheet imports and exports (ExcelJS) and
  the signed-documents backup (JSZip). They load on first use, so the staff
  app on a phone never downloads them. A failed download (offline, or an old
  tab after a new release) becomes a message staff can act on.
*/

async function loadOnFirstUse(load, what) {
  try {
    return (await load()).default;
  } catch (error) {
    throw new Error(
      `The ${what} could not be loaded. Check the internet connection, reload the page and try again.`,
      { cause: error }
    );
  }
}

export function loadExcelJS() {
  return loadOnFirstUse(() => import("exceljs"), "spreadsheet tool");
}

export function loadJSZip() {
  return loadOnFirstUse(() => import("jszip"), "zip tool");
}
