import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const Timer = ({ recipe, onEdit, onDelete, onBack }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [remainingTime, setRemainingTime] = useState(recipe.steps[currentStep] ? recipe.steps[currentStep].duration : 0);
  const [timerActive, setTimerActive] = useState(false);
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    let timer;
    if (timerActive && remainingTime > 0 && currentStep < recipe.steps.length) {
      timer = setTimeout(() => {
        setRemainingTime(remainingTime - 1);
      }, 1000);
    } else if (timerActive && remainingTime === 0 && currentStep < recipe.steps.length) {
      setTimerActive(false);
      setCompletedSteps([...completedSteps, currentStep]);
  
      if (currentStep < recipe.steps.length - 1) {
        setCurrentStep(currentStep + 1);
        setRemainingTime(recipe.steps[currentStep + 1].duration);
  
        if (recipe.steps[currentStep].autoNext) {
          setTimerActive(true);
        }
      }
    }
  
    return () => clearTimeout(timer);
  }, [timerActive, remainingTime]);
  
  const toggleTimer = () => {
    setTimerActive(!timerActive);
  };
  
  const resetTimer = () => {
    setTimerActive(false);
    setRemainingTime(recipe.steps[currentStep] ? recipe.steps[currentStep].duration : 0);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.recipeTitle}>{recipe.name}</Text>
      <View style={styles.stepsContainer}>
        {recipe.steps.map((step, index) => (
          <View key={index} style={styles.step}>
            <Text
              style={[
                styles.stepText,
                index === currentStep && styles.currentStep,
                completedSteps.includes(index) && styles.completedStep,
              ]}
            >
              {index + 1}. {step.description} ({step.duration}秒) {step.autoNext ? " ⬇" : ""}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actionsContainer}>
        <TouchableOpacity onPress={() => onEdit(recipe)}>
          <Text style={styles.editButton}>レシピを編集</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(recipe.id)}>
          <Text style={styles.deleteButton}>レシピを削除</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{remainingTime}秒</Text>
        <TouchableOpacity style={styles.timerButton} onPress={toggleTimer}>
          <Text style={styles.timerButtonText}>{timerActive ? '一時停止' : '開始'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetButton} onPress={resetTimer}>
          <Text style={styles.resetButtonText}>リセット</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.actionsContainer}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>戻る</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    marginTop: 36,
  },
  recipeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  stepsContainer: {
    marginBottom: 20,
  },
  step: {
    marginBottom: 10,
  },

  stepText: {
    fontSize: 18,
  },
  currentStep: {
    fontWeight: 'bold',
  },
  completedStep: {
    textDecorationLine: 'line-through',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 30,
  },
  timerText: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  timerButton: {
    backgroundColor: 'dodgerblue',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 10,
  },
  timerButtonText: {
    color: 'white',
    fontSize: 16,
  },
  resetButton: {
    backgroundColor: 'gray',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  editButton: {
    color: 'dodgerblue',
    fontSize: 16,
  },
  deleteButton: {
    color: 'red',
    fontSize: 16,
  },
  backButton: {
    color: 'gray',
    fontSize: 16,
  },
});

export default Timer;