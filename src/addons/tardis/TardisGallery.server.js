var mach    = require("mach");

var Ambidex   = require("../../Ambidex.server.js");
var utilities = require("../utilities.js");

function TardisGallery(
  {
    ambidexPromises,
    settings
  }
) {
  settings = utilities.recursiveCloneWithDefaults(
    settings,
    require("./settings.default.js")
  );

  // Introspect URLS from ambidexes, if they aren't already set
  if (settings.URLS) {
    settings.APPEND_PATH_TO_URLS = false;

    if (ambidexPromises) {
      var { HOST, PORT } = ambidexPromises[0].ambidexInProgress._get("settings");

      settings.URLS = settings.URLS.map(
        URL => URL.startsWith("/") && !URL.startsWith("//")
          ? `//${ HOST }:${ PORT }${ URL }`
          : URL
      );
    }
  } else {
    settings.URLS = ambidexPromises.map(
      promise => {
        var { HOST, PORT } = promise.ambidexInProgress._get("settings");

        return `//${ HOST }:${ PORT }`
      }
    );
  }

  var self = new Ambidex({ settings });
  self.mapper = mach.mapper();

  ambidexPromises = ambidexPromises.concat(self);

  ambidexPromises.forEach(
    promise => promise.ambidexInProgress._isBeingServedExternally = true
  );

  // Make sure the Ambidexes are dormant, then serve them by HOST with mapper
  return Promise.all(
    ambidexPromises
  ).then(
    ambidexes => Promise.all(
      ambidexes.map(
        ambidex => {
          if (ambidex.stack.nodeServer && ambidex.stack.nodeServer.address()) {
            return new Promise(
              (resolve, reject) => {
                ambidex.stack.nodeServer.close(
                  () => resolve(ambidex)
                );
              }
            );

          } else {
            return ambidex;
          }
        }
      )
    )
  ).then(
    ambidexes => {
      ambidexes.forEach(
        ambidex => {
          self.mapper.map(
            ambidex === self.ambidexInProgress
              ? "/"
              : `http://${ ambidex._get("settings").HOST }/`,
            ambidex.stack
          );
        }
      );

      return ambidexes;
    }
  ).then(
    ambidexes => {
     self.mapper.nodeServer = mach.serve(
        self.mapper,
        settings.VM_PORT || settings.PORT
      );

      return self;
    }
  ).catch(
    error => console.error(error.stack)
  );
}

module.exports = TardisGallery;

