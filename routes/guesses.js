var express = require('express');
var router = express.Router();
const Guess = require('../models/guess');
const mongoose = require('mongoose');
const debug = require('debug')('geo:guesses');
const ObjectId = mongoose.Types.ObjectId;
const webSocket = require('../app/backend/dispatcher')
const config = require('../config');
const utils = require('./utils');


/* GET guesses listing. */

/**
 * @api {get} /guesses List guesses
 * @apiName RetrieveGuesses
 * @apiGroup Guess
 * @apiVersion 1.0.0
 * @apiDescription Retrieves a list of guesses.
 *
 * @apiUse GuessInResponseBody
 * @apiUse GuessIncludes
 *
 * @apiParam (URL query parameters) {String} [userID] Select only guesses made by the user with the specified ID
 * @apiParam (URL query parameters) {Number} [scoredAtLeast] Select only guesses with a score greater than or equal to the specified score
 *
 * @apiExample Example
 *     GET /guesses/?scoredAtLeast=70 HTTP/1.1
 *
 * @apiSuccessExample 200 OK
 *     HTTP/1.1 200 OK
 *     Content-Type: application/json
 *     Link: &lt;https://comem-archioweb-2019-2020-g.herokuapp.com/guesses/?scoredAtLeast=70&gt;; rel="first prev"
 *
 *     [
 *       {
 *         "location":{"type":"Point","coordinates":[-42.856077,31.838647]},
 *         "_id":"5dc3ccaffe75680017e15556",
 *         "thumbnail_id":"5dc3cc5afe75680017e15554",
 *         "user_id":"5dc358b8e33d100017730511",
 *         "score":120,
 *         "created_at":"2019-11-07T07:50:07.615Z",
 *       },
 *       {
 *         "location":{"type":"Point","coordinates":[-33.856077,60.848447]},
 *         "_id":"5dc3ce7bfe75680017e1555a",
 *         "thumbnail_id":"5dc3ce38fe75680017e15558",
 *         "user_id":"5dc358b8e33d100017730511",
 *         "score":94,
 *         "created_at":"2019-11-07T07:57:47.991Z",
 *       }
 *     ]
 */

router.get('/', function(req, res, next) {
     let query = queryGuesses(req);
  query.exec(function(err, guesses) {
    if (err) {
      return next(err);
    }
    res.send(guesses);
  });
});

/* POST new guess */

/**
 * @api {post} /guesses Create a guess
 * @apiName CreateGuess
 * @apiGroup Guess
 * @apiVersion 1.0.0
 * @apiDescription Registers a new guess.
 *
 * @apiUse GuessInRequestBody
 * @apiUse GuessInResponseBody
 * @apiUse GuessValidationError
 * @apiSuccess (Response body) {String} id A unique identifier for the guess generated by the server
 *
 * @apiExample Example
 *     POST /guesses HTTP/1.1
 *     Content-Type: application/json
 *     {
 *       "location":{"type":"Point","coordinates":[-25.856077,40.838447]},
 *       "thumbnail_id":"5dcfde2bb6cd1e001751bf7d",
 *       "user_id":"5dc35896e33d10001773050f",
 *       "score":50,
 *      }
 *
 * @apiSuccessExample 201 Created
 *     HTTP/1.1 201 Created
 *     Content-Type: application/json
 *     Location: https://comem-archioweb-2019-2020-g.herokuapp.com/guesses/58b2926f5e1def0123e97281
 *
 *     {
 *       "id": "58b2926f5e1def0123e97281",
 *       "location":{"type":"Point","coordinates":[-25.856077,40.838447]},
 *       "thumbnail_id":"5dcfde2bb6cd1e001751bf7d",
 *       "user_id":"5dc35896e33d10001773050f",
 *       "score":50,
 *      }
 */

router.post('/', function(req, res, next) {
  // Create a new document from the JSON in the request body
  const newGuess = new Guess(req.body);
  // Save that document
  newGuess.save(function(err, savedGuess) {
    if (err) {
      return next(err);
    }
    // Send the saved document in the response
    res
    .status(201)
    .set('Location', `${config.baseUrl}/guesses/${savedGuess._id}`)
    .send(savedGuess);
    webSocket.notifyNewGuess(JSON.stringify(savedGuess));
    //json.stringify
  });
// appeler la fonction pour envoyer un message via WebSocket

});

function loadGuessFromParamsMiddleware(req, res, next) {

  const guessId = req.params.id;
  if (!ObjectId.isValid(guessId)) {
    return guessNotFound(res, guessId);
  }

  let query = Guess.findById(guessId)

  query.exec(function (err, guess) {
    if (err) {
      return next(err);
    } else if (!guess) {
      return guessNotFound(res, guessId);
    }

    req.guess = guess;
    next();
  });
}

function guessNotFound(res, guessId) {
  return res.status(404).type('text').send(`No guess found with ID ${guessId}`);
}

/*DELETE guess*/

/**
 * @api {delete} /guesses/:id Delete a guess
 * @apiName DeleteGuess
 * @apiGroup Guess
 * @apiVersion 1.0.0
 * @apiDescription Permanently deletes a guess.
 *
 * @apiUse GuessIdInUrlPath
 * @apiUse GuessNotFoundError
 *
 * @apiExample Example
 *     DELETE /guesses/58b2926f5e1def0123e97bc0 HTTP/1.1
 *
 * @apiSuccessExample 204 No Content
 *     HTTP/1.1 204 No Content
 */

router.delete('/:id', loadGuessFromParamsMiddleware, utils.authenticate, function (req, res, next) {
  req.guess.remove(function (err) {
    if (err) {
      return next(err);
    }

    debug(`Deleted guess "${req.guess.created_at}"`);
    res.sendStatus(204);
  });
});

function queryGuesses(req){
  let query = Guess.find();

//permet de filtrer via ?scoredAtLeast=x
   if (!isNaN(req.query.scoredAtLeast)) {
    query = query.where('score').gte(req.query.scoredAtLeast);
  }

  //permet de filtrer via ?userID=x
   if (Array.isArray(req.query.userID)) {
    const users = req.query.userID.filter(ObjectId.isValid);
    query = query.where('user_id').in(users);
  } else if (ObjectId.isValid(req.query.userID)) {
    query = query.where('user_id').equals(req.query.userID);
  }

return query
}

/**
 * @apiDefine GuessInRequestBody
 * @apiParam (Request body) {String} thumbnail_id An Id who is referencing to the thumbnail for which the guess is made (eg: 5dcfde651b7d080017510ba9)
 * @apiParam (Request body) {String} user_id An Id who is referencing to the user who make the guess (eg: 5dc426bb05ca0800175ab7b2)
 * @apiParam (Request body) {Number} score The score obtained by the guess
 * @apiParam (Request body) {Object} location The location object, at which the guess is made
 * @apiParam (Request body) {String} location[type] The type of coordinates
 * @apiParam (Request body) {Number} location[coordinates] The coordinates of the location
 */

/**
 * @apiDefine GuessInResponseBody
 * @apiSuccess (Response body) {String} id The unique identifier of the guess
 * @apiSuccess (Response body) {String} user_id An Id who is referencing to the user who made the guess (eg: 5dc426bb05ca0800175ab7b2)
 * @apiSuccess (Response body) {String} thumbnail_id An Id who is referencing to the thumbnail for which the guess has been made (eg: 5dcfde651b7d080017510ba9)
 * @apiSuccess (Response body) {Object} location The location object, at which the guess has been made
 * @apiSuccess (Response body) {String} location[type] The type of coordinates
 * @apiSuccess (Response body) {Number} location[coordinates] The coordinates of the location
 * @apiSuccess (Response body) {String} createdAt The date at which the guess was registered
 */

 /**
 * @apiDefine GuessValidationError
 *
 * @apiError {Object} 422/UnprocessableEntity Some of the guess's properties are invalid
 *
 * @apiErrorExample {json} 422 Unprocessable Entity
 *     HTTP/1.1 422 Unprocessable Entity
 *     Content-Type: application/json
 *
 *     {
 *       "message": "Guess validation failed",
 *       "errors": {
 *         "user_id": {
 *           "kind": "string",
 *           "message": "`foo` is not a valid string value for path `user_id`.",
 *           "name": "ValidatorError",
 *           "path": "user_id",
 *           "properties": "string":,
 *             "message": "`{VALUE}` is not a valid string value for path `{PATH}`.",
 *             "path": "user_id",
 *             "type": "string",
 *             "value": "foo"
 *           },
 *           "value": "foo"
 *         }
 *       }
 *     }
 */

 /**
 * @apiDefine GuessIncludes
 * @apiParam (URL query parameters) {String} [include] Embed linked resources in the response body:
 * * `"userID"` for the ID of the user who made the guess
 */

 /**
 * @apiDefine GuessIdInUrlPath
 * @apiParam (URL path parameters) {String} id The unique identifier of the guess to retrieve
 */

 /**
 * @apiDefine GuessNotFoundError
 *
 * @apiError {Object} 404/NotFound No guess was found corresponding to the ID in the URL path
 *
 * @apiErrorExample {json} 404 Not Found
 *     HTTP/1.1 404 Not Found
 *     Content-Type: text/plain
 *
 *     No guess found with ID 58b2926f5e1def0123e97281
 */

module.exports = router;