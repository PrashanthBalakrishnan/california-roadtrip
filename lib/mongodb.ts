import { MongoClient } from "mongodb";

const databaseName = process.env.MONGODB_DB || "calidb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getTripPlansCollection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables.");
  }

  const clientPromise =
    global._mongoClientPromise ||
    (() => {
      const client = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000
      });
      return client.connect();
    })();

  if (process.env.NODE_ENV !== "production") {
    global._mongoClientPromise = clientPromise;
  }

  const connectedClient = await clientPromise;
  return connectedClient.db(databaseName).collection("trip_plans");
}
