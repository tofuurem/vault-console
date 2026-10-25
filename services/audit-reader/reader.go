package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"time"
)

const chunkSize = 64 * 1024

// Page is one newest-first slice of matching events.
type Page struct {
	Events       []Event   `json:"events"`
	ScannedBytes int64     `json:"scannedBytes"`
	Exhausted    bool      `json:"exhausted"`
	NextBefore   time.Time `json:"nextBefore,omitempty"`
}

// Status describes the audit file without reading its contents.
type Status struct {
	Available bool      `json:"available"`
	SizeBytes int64     `json:"sizeBytes"`
	Modified  time.Time `json:"modified,omitempty"`
}

type Reader struct {
	path         string
	maxScanBytes int64
}

func NewReader(path string, maxScanBytes int64) *Reader {
	return &Reader{path: path, maxScanBytes: maxScanBytes}
}

func (r *Reader) Status() Status {
	info, err := os.Stat(r.path)
	if err != nil || !info.Mode().IsRegular() {
		return Status{}
	}
	return Status{Available: true, SizeBytes: info.Size(), Modified: info.ModTime().UTC()}
}

// Search scans the file backwards so the newest events are found first and
// stops after limit matches or maxScanBytes, whichever comes first.
func (r *Reader) Search(filter Filter, limit int) (Page, error) {
	file, err := os.Open(r.path)
	if err != nil {
		return Page{}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return Page{}, err
	}

	page := Page{Events: []Event{}}
	offset := info.Size()
	var carry []byte
	for offset > 0 && len(page.Events) < limit {
		if page.ScannedBytes >= r.maxScanBytes {
			return page, nil
		}
		size := int64(chunkSize)
		if offset < size {
			size = offset
		}
		offset -= size
		chunk := make([]byte, size, int(size)+len(carry))
		if _, err := file.ReadAt(chunk, offset); err != nil && !errors.Is(err, io.EOF) {
			return page, err
		}
		page.ScannedBytes += size
		buffer := append(chunk, carry...)
		lines := bytes.Split(buffer, []byte{'\n'})
		// The first piece may be the tail of a line that starts in an earlier chunk.
		carry = append([]byte(nil), lines[0]...)
		collect(&page, lines[1:], filter, limit)
	}
	if offset == 0 && len(page.Events) < limit {
		collect(&page, [][]byte{carry}, filter, limit)
		page.Exhausted = true
	}
	if n := len(page.Events); n > 0 {
		page.NextBefore = page.Events[n-1].Time
	}
	return page, nil
}

func collect(page *Page, lines [][]byte, filter Filter, limit int) {
	for i := len(lines) - 1; i >= 0 && len(page.Events) < limit; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) == 0 {
			continue
		}
		if event, ok := parseEvent(line); ok && filter.matches(event) {
			page.Events = append(page.Events, event)
		}
	}
}
