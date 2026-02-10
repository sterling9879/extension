const IMAGE_STORE = "imageStore";
const REF_STORE = "refImageStore";

let dbInstance = null;

function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = new Promise((resolve, reject) => {
    const request = indexedDB.open("AutoFlowDB", 2);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REF_STORE)) {
        db.createObjectStore(REF_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });

  return dbInstance;
}

export async function saveImage(file) {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const metadata = { id, name: file.name, type: file.type };
  const record = { id, file };

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(IMAGE_STORE, "readwrite")
      .objectStore(IMAGE_STORE)
      .put(record);

    request.onsuccess = () => {
      resolve(metadata);
    };

    request.onerror = (event) => {
      console.error("IndexedDB put error:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function getImage(id) {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(IMAGE_STORE, "readonly")
      .objectStore(IMAGE_STORE)
      .get(id);

    request.onsuccess = (event) => {
      if (event.target.result) {
        resolve(event.target.result.file);
      } else {
        resolve(null);
      }
    };

    request.onerror = (event) => {
      console.error("IndexedDB get error:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function deleteImage(id) {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(IMAGE_STORE, "readwrite")
      .objectStore(IMAGE_STORE)
      .delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("IndexedDB delete file error:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function clearAllImages() {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(IMAGE_STORE, "readwrite")
      .objectStore(IMAGE_STORE)
      .clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("IndexedDB clear error:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function saveRefImage(file) {
  const db = await getDatabase();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = {
        id,
        name: file.name,
        type: file.type,
        dataUrl: reader.result,
        timestamp: Date.now(),
      };
      const request = db
        .transaction(REF_STORE, "readwrite")
        .objectStore(REF_STORE)
        .put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = (event) => reject(event.target.error);
    };
    reader.onerror = (event) => reject(event.target.error);
    reader.readAsDataURL(file);
  });
}

export async function getAllRefImages() {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(REF_STORE, "readonly")
      .objectStore(REF_STORE)
      .getAll();
    request.onsuccess = (event) => resolve(event.target.result || []);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function deleteRefImage(id) {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(REF_STORE, "readwrite")
      .objectStore(REF_STORE)
      .delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function clearAllRefImages() {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(REF_STORE, "readwrite")
      .objectStore(REF_STORE)
      .clear();
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}
