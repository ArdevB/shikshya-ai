# At-risk student prediction

Written for the project report and viva. The code is in `apps/ai/ml` and `apps/ai/app/risk.py`, and the API side is `apps/api/src/services/risk.service.ts`. The [model card](../../apps/ai/ml/model_card.md) is generated each time the model is trained, and holds the latest figures.

## What it does

Estimates the chance that a student will fail a course, from how they are doing in it so far. Teachers see it as a prompt to check on someone, along with the reasons. **It does not decide anything by itself, and students never see a label.** A flagged student may get a supportive message offering help, at most once a week.

## The data is synthetic

Shikshya has no real history to learn from, so `ml/generate_synthetic.py` makes 8,000 rows from stated assumptions. This matters a lot when reading the results: **the figures show that the method works on data of this shape, not how accurate it would be at a real college.** Before relying on it, retrain it on real past results.

## Features

| Feature               | Meaning                                     | More of it means |
| --------------------- | ------------------------------------------- | ---------------- |
| `attendance_pct`      | Attendance so far                           | Less risk        |
| `attendance_trend`    | Change in attendance between recent periods | Less risk        |
| `internal_exam_pct`   | Internal exam marks                         | Less risk        |
| `submission_rate_pct` | Share of assignments handed in              | Less risk        |
| `avg_assignment_pct`  | Marks on those assignments                  | Less risk        |
| `late_rate_pct`       | Share handed in late                        | More risk        |
| `previous_gpa`        | Last semester's GPA                         | Less risk        |

New students have no previous GPA, and there may be no exam marks early in a semester. Missing values are filled with the median from training.

## Choosing the model

Two models were compared with stratified 5-fold cross-validation on the training split. **Stratified** means each fold keeps the same share of at-risk students, which matters because they are the smaller group.

| Model                   | Accuracy | Precision | Recall     | F1     | F2         | ROC-AUC |
| ----------------------- | -------- | --------- | ---------- | ------ | ---------- | ------- |
| **Logistic Regression** | 0.8528   | 0.6805    | **0.8657** | 0.7620 | **0.8210** | 0.9326  |
| Random Forest           | 0.8558   | 0.6911    | 0.8502     | 0.7624 | 0.8128     | 0.9301  |

### Why recall, and why F2?

The two possible mistakes do not cost the same:

- **Missing a student who then fails** (a false negative) can cost them the course.
- **Checking on a student who was fine** (a false positive) costs a teacher a short conversation.

So the model is chosen by **F2**, which counts recall twice as heavily as precision, rather than by accuracy. Accuracy would be misleading here too: with 27% of students at risk, calling everyone safe already scores 73%.

$$F_\beta = (1 + \beta^2) \cdot \frac{\text{precision} \cdot \text{recall}}{\beta^2 \cdot \text{precision} + \text{recall}}, \qquad \beta = 2$$

Logistic Regression won. It also has the advantage of being easy to explain, which matters for something that affects how a student is treated.

## The alert threshold

A probability of 0.5 is not automatically the right place to flag someone. The threshold is set to the highest value that still reaches 82% recall on the training split, using predictions from the cross-validation folds so it is not tuned on data the model has memorised. That gives **0.5871**. Halfway from there to certainty, **0.7935**, marks a student as HIGH rather than MEDIUM.

## Results on the held-out test split

The test split was not used for training or for choosing anything.

| Accuracy | Precision | Recall     | F1     | ROC-AUC |
| -------- | --------- | ---------- | ------ | ------- |
| 0.8681   | 0.7258    | **0.8276** | 0.7734 | 0.9344  |

Recall of 0.83 beats the project's target of 0.75. Precision of 0.73 means about a quarter of flagged students would have passed anyway, which is the price of favouring recall.

## Reasons shown to teachers

A bare probability gives a teacher nothing to act on, so each flag comes with reasons:

$$\text{contribution} = \text{importance} \times \frac{\text{distance from typical}}{\text{standard deviation}} \times \text{risky direction}$$

The largest positive contributions become sentences such as "Attendance is 58%". Reasons that are not really concerns are dropped: a student whose attendance is below the median but still healthy does not get told it is a problem. This is an approximation that is simple to explain, not a claim about causes.

## Limitations

- Trained on made-up data, so real-world accuracy is unknown.
- About a quarter of those flagged would pass anyway, and it misses about 17% of those who fail. It is a prompt, not a verdict.
- It only sees numbers. Illness, family events and the like are invisible to it.
- It has not been checked for fairness between groups of students, and the data has no such groups to check. That would need doing with real data before using it for real.

## Testing

`apps/ai/tests/test_risk.py` checks that training reaches the recall target, that a strong student comes out low risk and a struggling one high risk with reasons, that good numbers never become reasons, and that missing values are handled. `apps/api/test/ai-features.test.ts` checks that features are computed correctly, that reasons are plain and worth mentioning, that only the class's teacher and admins can see a flag, and that students cannot reach a label by any route.
