use std::cmp::Ordering;

pub fn sort_names<T, F>(items: &mut [T], name: F)
where
    F: Fn(&T) -> &str,
{
    items.sort_by(|left, right| compare(name(left), name(right)));
}

pub fn compare(left: &str, right: &str) -> Ordering {
    let left = tokenize(left);
    let right = tokenize(right);

    for (left_part, right_part) in left.iter().zip(right.iter()) {
        let ordering = match (left_part, right_part) {
            (Token::Number(left), Token::Number(right)) => left.cmp(right),
            (Token::Text(left), Token::Text(right)) => left.cmp(right),
            (Token::Number(_), Token::Text(_)) => Ordering::Less,
            (Token::Text(_), Token::Number(_)) => Ordering::Greater,
        };

        if ordering != Ordering::Equal {
            return ordering;
        }
    }

    left.len().cmp(&right.len())
}

#[derive(Debug, PartialEq, Eq)]
enum Token {
    Number(u64),
    Text(String),
}

fn tokenize(value: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut chars = value.char_indices().peekable();

    while let Some((start, first)) = chars.next() {
        let is_digit = first.is_ascii_digit();
        let mut end = start + first.len_utf8();

        while let Some((index, next)) = chars.peek().copied() {
            if next.is_ascii_digit() != is_digit {
                break;
            }
            chars.next();
            end = index + next.len_utf8();
        }

        let part = &value[start..end];
        if is_digit {
            tokens.push(Token::Number(part.parse().unwrap_or(u64::MAX)));
        } else {
            tokens.push(Token::Text(part.to_lowercase()));
        }
    }

    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_numbered_files_naturally() {
        let mut names = vec!["10.jpg", "1.jpg", "2.jpg", "cover.jpg", "A.jpg"];
        sort_names(&mut names, |name| name);
        assert_eq!(
            names,
            vec!["1.jpg", "2.jpg", "10.jpg", "A.jpg", "cover.jpg"]
        );
    }

    #[test]
    fn compares_mixed_prefixes() {
        assert_eq!(compare("image-2.jpg", "image-10.jpg"), Ordering::Less);
        assert_eq!(compare("b.jpg", "a.jpg"), Ordering::Greater);
    }
}
