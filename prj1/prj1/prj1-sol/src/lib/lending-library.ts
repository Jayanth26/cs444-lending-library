import { Errors } from 'cs544-js-utils';

/** Note that errors are documented using the `code` option which must be
 *  returned (the `message` can be any suitable string which describes
 *  the error as specifically as possible).  Whenever possible, the
 *  error should also contain a `widget` option specifying the widget
 *  responsible for the error).
 *
 *  Note also that none of the function implementations should normally
 *  require a sequential scan over all books or patrons.
 */

/******************** Types for Validated Requests *********************/



/** used as an ID for a book */
type ISBN = string; 

/** used as an ID for a library patron */
type PatronId = string;

export type Book = {
  isbn: ISBN;
  title: string;
  authors: string[];
  pages: number;      //must be int > 0
  year: number;       //must be int > 0
  publisher: string;
  nCopies?: number;   //# of copies owned by library; not affected by borrows;
                      //must be int > 0; defaults to 1
};

export type XBook = Required<Book>;

type AddBookReq = Book;
type FindBooksReq = { search: string; };
type ReturnBookReq = { patronId: PatronId; isbn: ISBN; };
type CheckoutBookReq = { patronId: PatronId; isbn: ISBN; };



/************************ Main Implementation **************************/

export function makeLendingLibrary() {
  return new LendingLibrary();
}

export class LendingLibrary {

  private books: Record<ISBN, XBook>;
  private wordIndex: Record<string, Set<ISBN>>;
  private patronBooks: Record<PatronId, Set<ISBN>>;
  private checkedOut: Record<ISBN, number>;

  constructor() {
  this.books = {};
  this.wordIndex = {};
  this.patronBooks = {};
  this.checkedOut = {};
}

  /** Add one-or-more copies of book represented by req to this library.
   *
   *  Errors:
   *    MISSING: one-or-more of the required fields is missing.
   *    BAD_TYPE: one-or-more fields have the incorrect type.
   *    BAD_REQ: other issues like nCopies not a positive integer 
   *             or book is already in library but data in obj is 
   *             inconsistent with the data already present.
   */
  addBook(req: Record<string, any>): Errors.Result<XBook> {
  const result = validateAddBookReq(req);
  if (!result.isOk) return result;

  const book = result.val;
  const oldBook = this.books[book.isbn];

  if (oldBook) {
    const fields = ['title', 'pages', 'year', 'publisher'] as const;

    for (const field of fields) {
      if (oldBook[field] !== book[field]) {
        return Errors.errResult(
          `inconsistent ${field} data for book ${book.isbn}`,
          'BAD_REQ',
          field
        );
      }
    }

  if (oldBook.authors.length !== book.authors.length ||
      oldBook.authors.some((a, i) => a !== book.authors[i])) {
      return Errors.errResult(
        `inconsistent authors data for book ${book.isbn}`,
        'BAD_REQ',
        'authors'
      );
    }

    oldBook.nCopies += book.nCopies;
    return Errors.okResult(oldBook);
  }

  this.books[book.isbn] = book;

  for (const word of bookWords(book)) {
    if (!this.wordIndex[word]) {
      this.wordIndex[word] = new Set<ISBN>();
    }
    this.wordIndex[word].add(book.isbn);
  }

  return Errors.okResult(book);
}

  /** Return all books matching (case-insensitive) all "words" in
   *  req.search, where a "word" is a max sequence of /\w/ of length > 1.
   *  Returned books should be sorted in ascending order by title.
   *
   *  Errors:
   *    MISSING: search field is missing
   *    BAD_TYPE: search field is not a string.
   *    BAD_REQ: no words in search
   */
  findBooks(req: Record<string, any>) : Errors.Result<XBook[]> {
  const result = validateFindBooksReq(req);
  if (!result.isOk) return result;

  const words = extractWords(result.val.search);

  if (words.length === 0) {
    return Errors.errResult(
      'search contains no words',
      'BAD_REQ',
      'search'
    );
  }

  let isbns = new Set(this.wordIndex[words[0]] ?? []);

  for (const word of words.slice(1)) {
    const matches = this.wordIndex[word] ?? new Set<ISBN>();
    isbns = new Set([...isbns].filter(isbn => matches.has(isbn)));
  }

  const books = [...isbns]
    .map(isbn => this.books[isbn])
    .sort((a, b) => a.title.localeCompare(b.title));

  return Errors.okResult(books);
}


  /** Set up patron req.patronId to check out book req.isbn. 
   * 
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ error on business rule violation.
   */
  checkoutBook(req: Record<string, any>) : Errors.Result<void> {
    const required = ['patronId', 'isbn'];
    //checks to see if any fields are missing
    for (const field of required) {
        if(req[field] === undefined) {
            return Errors.errResult(
                'property ${field} is required',
                'MISSING',
                field
            );
        }
    }
    //checks to make sure fields of the right type
    for( const field of required) {
        if(typeof req[field] !== 'string') {
            return Errors.errResult(
                'property ${field} must be a string',
                'BAD_TYPE',
                field
            )
        }
    }
    
    const patronId = req.patronId;
    const isbn = req.isbn;

    //checks if the book exists
    const book = this.books[isbn];

    if (!book){
        return Errors.errResult(
            'book ${isbn} does not exist',
            'BAD_REQ',
            'isbn'
        );
    }

    //creates a set of books that patron checked out if doesnt exist
    if(!this.patronBooks[patronId]) {
        this.patronBooks[patronId] = new Set<ISBN>();
    }

    //checks if the patron is checking out the same book twice
    if (this.patronBooks[patronId].has(isbn)) {
        return Errors.errResult(
            'patron ${patronId} already has book ${isbn}',
            'BAD_REQ',
            'isbn'
        )
    }

    //checks to see if the book is available
    const checkedOut = this.checkedOut[isbn] ?? 0;
    //uses checkedout as a variable to count how many books are checkedout
    if(checkedOut >= book.nCopies){
        return Errors.errResult (
            'no copies of book ${isbn} are available',
            'BAD_REQ',
            'isbn'
        );
    }

    //if passes all these test, then it checks out the book
    this.patronBooks[patronId].add(isbn);
    this.checkedOut[isbn] = checkedOut + 1;

    return Errors.okResult(undefined); 
  }

  /** Set up patron req.patronId to returns book req.isbn.
   *  
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ error on business rule violation.
   */
 returnBook(req: Record<string, any>): Errors.Result<void> {
  const required = ['patronId', 'isbn'];

  // check for missing fields
  for (const field of required) {
    if (req[field] === undefined) {
      return Errors.errResult(
        `property ${field} is required`,
        'MISSING',
        field
      );
    }
  }

  // check field types
  for (const field of required) {
    if (typeof req[field] !== 'string') {
      return Errors.errResult(
        `property ${field} must be a string`,
        'BAD_TYPE',
        field
      );
    }
  }

  const patronId = req.patronId;
  const isbn = req.isbn;

  // make sure book exists
  const book = this.books[isbn];

  if (!book) {
    return Errors.errResult(
      `book ${isbn} does not exist`,
      'BAD_REQ',
      'isbn'
    );
  }

  // get books checked out by this patron
  const patronBooks = this.patronBooks[patronId];

  // patron must actually have this book
  if (!patronBooks || !patronBooks.has(isbn)) {
    return Errors.errResult(
      `patron ${patronId} does not have book ${isbn}`,
      'BAD_REQ',
      'isbn'
    );
  }

  // return the book
  patronBooks.delete(isbn);

  this.checkedOut[isbn] =
    (this.checkedOut[isbn] ?? 1) - 1;

  return Errors.okResult(undefined);
}
}


/********************** Domain Utility Functions ***********************/

function validateAddBookReq(req: Record<string, any>): Errors.Result<XBook> {
  const errors: Errors.Err[] = [];

  const required = ['isbn', 'title', 'authors', 'pages', 'year', 'publisher'];

  for (const field of required) {
    if (req[field] === undefined) {
      errors.push(new Errors.Err(
        `property ${field} is required`,
        { code: 'MISSING', widget: field }
      ));
    }
  }

  if (errors.length > 0) return new Errors.ErrResult(errors);

  for (const field of ['isbn', 'title', 'publisher']) {
    if (typeof req[field] !== 'string') {
      errors.push(new Errors.Err(
        `property ${field} must be a string`,
        { code: 'BAD_TYPE', widget: field }
      ));
    }
  }

  if (!Array.isArray(req.authors) ||
      req.authors.length === 0 ||
      !req.authors.every((a: any) => typeof a === 'string')) {
    errors.push(new Errors.Err(
      'authors must have type string[]',
      { code: 'BAD_TYPE', widget: 'authors' }
    ));
  }

  for (const field of ['pages', 'year', 'nCopies']) {
    if (field === 'nCopies' && req[field] === undefined) continue;

    if (typeof req[field] !== 'number') {
      errors.push(new Errors.Err(
        `property ${field} must be numeric`,
        { code: 'BAD_TYPE', widget: field }
      ));
    }
    else if (!Number.isInteger(req[field]) || req[field] <= 0) {
      errors.push(new Errors.Err(
        `property ${field} must be a positive integer`,
        { code: 'BAD_REQ', widget: field }
      ));
    }
  }

  if (errors.length > 0) return new Errors.ErrResult(errors);

  const book: XBook = {
    isbn: req.isbn,
    title: req.title,
    authors: [...req.authors],
    pages: req.pages,
    year: req.year,
    publisher: req.publisher,
    nCopies: req.nCopies ?? 1
  };

  return Errors.okResult(book);
}


function validateFindBooksReq(
  req: Record<string, any>
): Errors.Result<FindBooksReq> {

  if (req.search === undefined) {
    return Errors.errResult(
      'property search is required',
      'MISSING',
      'search'
    );
  }

  if (typeof req.search !== 'string') {
    return Errors.errResult(
      'property search must be a string',
      'BAD_TYPE',
      'search'
    );
  }

  return Errors.okResult(req as FindBooksReq);
}


function bookWords(book: XBook): string[] {
  return extractWords(
    book.title + ' ' + book.authors.join(' ')
  );
}


/********************* General Utility Functions ***********************/

function extractWords(s: string): string[] {
  const words = s.toLowerCase().match(/\w+/g) ?? [];
  return [...new Set(words.filter(w => w.length > 1))];
}
